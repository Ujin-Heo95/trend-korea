import type { Pool } from 'pg';
import { normalizeTitle, bigrams } from './dedup.js';

// ─── Types ───

export interface TrendKeywordEntry {
  readonly keyword: string;
  readonly normalized: string;
  readonly sourceKey: string;
  readonly signalStrength: number;
  readonly scrapedAt: Date;
}

export interface MatchResult {
  readonly matchedSources: ReadonlySet<string>;
  readonly bestStrength: number;
  readonly avgTemporalDecay: number;
}

// ─── Constants (코드 기본값 — DB 설정으로 오버라이드 가능) ───

let MIN_KOREAN_KEYWORD_LEN = 2;
let MIN_LATIN_KEYWORD_LEN = 3;
let TREND_SIGNAL_BONUS_CAP = 1.8;
let BASE_BONUS_BY_COUNT: readonly number[] = [1.0, 1.15, 1.35, 1.6];

import { getScoringConfig } from './scoringConfig.js';

/** 트렌드 신호 상수를 DB에서 로드하여 모듈 변수에 반영 */
export async function reloadTrendSignalConfig(): Promise<void> {
  try {
    const config = getScoringConfig();
    const group = await config.getGroup('trend_signal');
    MIN_KOREAN_KEYWORD_LEN = (group['MIN_KOREAN_KEYWORD_LEN'] as number) ?? 2;
    MIN_LATIN_KEYWORD_LEN = (group['MIN_LATIN_KEYWORD_LEN'] as number) ?? 3;
    TREND_SIGNAL_BONUS_CAP = (group['TREND_SIGNAL_BONUS_CAP'] as number) ?? 1.8;
    const arr = group['BASE_BONUS_BY_COUNT'];
    if (Array.isArray(arr)) BASE_BONUS_BY_COUNT = arr as number[];
  } catch {
    // DB 실패 시 기존 값 유지
  }
}

// ─── Keyword Extraction ───

/** 기존 스크래퍼가 posts 테이블에 저장한 외부 트렌드 데이터를 trend_keywords로 변환 */
export async function extractTrendKeywords(pool: Pool): Promise<number> {
  // Google Trends: metadata->>'keyword'
  const googleRows = await pool.query<{
    keyword: string; traffic_num: number; scraped_at: Date;
  }>(`
    SELECT metadata->>'keyword' AS keyword,
           COALESCE((metadata->>'trafficNum')::int, 0) AS traffic_num,
           scraped_at
    FROM posts
    WHERE source_key = 'google_trends'
      AND scraped_at > NOW() - INTERVAL '12 hours'
      AND metadata->>'keyword' IS NOT NULL
  `);

  // BigKinds: metadata->>'keyword' (= title)
  const bigkindsRows = await pool.query<{
    keyword: string; article_count: number; scraped_at: Date;
  }>(`
    SELECT metadata->>'keyword' AS keyword,
           COALESCE((metadata->>'articleCount')::int, 0) AS article_count,
           scraped_at
    FROM posts
    WHERE source_key = 'bigkinds_issues'
      AND scraped_at > NOW() - INTERVAL '12 hours'
      AND metadata->>'keyword' IS NOT NULL
  `);

  // Naver DataLab: author 필드에 키워드 쉼표 구분, 또는 metadata.keywords
  const naverRows = await pool.query<{
    keywords_str: string; change_pct: number; scraped_at: Date;
    meta_keywords: string[] | null;
  }>(`
    SELECT author AS keywords_str,
           COALESCE(view_count, 0) AS change_pct,
           scraped_at,
           CASE WHEN metadata ? 'keywords' THEN ARRAY(SELECT jsonb_array_elements_text(metadata->'keywords')) ELSE NULL END AS meta_keywords
    FROM posts
    WHERE source_key = 'naver_datalab'
      AND scraped_at > NOW() - INTERVAL '12 hours'
  `);

  // Build UPSERT values
  const entries: { keyword: string; normalized: string; sourceKey: string; strength: number; metadata: string; scrapedAt: Date }[] = [];

  for (const r of googleRows.rows) {
    if (!r.keyword || r.keyword.length < 2) continue;
    entries.push({
      keyword: r.keyword,
      normalized: normalizeTitle(r.keyword),
      sourceKey: 'google_trends',
      strength: Math.min(r.traffic_num / 100_000, 1.0),
      metadata: JSON.stringify({ trafficNum: r.traffic_num }),
      scrapedAt: r.scraped_at,
    });
  }

  for (const r of bigkindsRows.rows) {
    if (!r.keyword || r.keyword.length < 2) continue;
    entries.push({
      keyword: r.keyword,
      normalized: normalizeTitle(r.keyword),
      sourceKey: 'bigkinds_issues',
      strength: Math.min(r.article_count / 100, 1.0),
      metadata: JSON.stringify({ articleCount: r.article_count }),
      scrapedAt: r.scraped_at,
    });
  }

  for (const r of naverRows.rows) {
    // metadata.keywords 우선, 없으면 author 필드 파싱
    const keywords = r.meta_keywords ?? r.keywords_str?.split(',').map(k => k.trim()).filter(Boolean) ?? [];
    const strength = Math.min(Math.max(r.change_pct, 0) / 100, 1.0);
    for (const kw of keywords) {
      if (kw.length < 2) continue;
      entries.push({
        keyword: kw,
        normalized: normalizeTitle(kw),
        sourceKey: 'naver_datalab',
        strength,
        metadata: JSON.stringify({ changePct: r.change_pct }),
        scrapedAt: r.scraped_at,
      });
    }
  }

  // Nate 실시간 검색어: metadata->>'keyword'
  const nateRows = await pool.query<{
    keyword: string; rank: number; scraped_at: Date;
  }>(`
    SELECT metadata->>'keyword' AS keyword,
           COALESCE((metadata->>'rank')::int, 10) AS rank,
           scraped_at
    FROM posts
    WHERE source_key = 'nate_realtime'
      AND scraped_at > NOW() - INTERVAL '12 hours'
      AND metadata->>'keyword' IS NOT NULL
  `);

  for (const r of nateRows.rows) {
    if (!r.keyword || r.keyword.length < 2) continue;
    entries.push({
      keyword: r.keyword,
      normalized: normalizeTitle(r.keyword),
      sourceKey: 'nate_realtime',
      strength: Math.max(0.1, 1.0 - (r.rank - 1) * 0.09),
      metadata: JSON.stringify({ rank: r.rank }),
      scrapedAt: r.scraped_at,
    });
  }

  // ZUM 실시간 검색어: metadata->>'keyword'
  const zumRows = await pool.query<{
    keyword: string; rank: number; scraped_at: Date;
  }>(`
    SELECT metadata->>'keyword' AS keyword,
           COALESCE((metadata->>'rank')::int, 10) AS rank,
           scraped_at
    FROM posts
    WHERE source_key = 'zum_realtime'
      AND scraped_at > NOW() - INTERVAL '12 hours'
      AND metadata->>'keyword' IS NOT NULL
  `);

  for (const r of zumRows.rows) {
    if (!r.keyword || r.keyword.length < 2) continue;
    entries.push({
      keyword: r.keyword,
      normalized: normalizeTitle(r.keyword),
      sourceKey: 'zum_realtime',
      strength: Math.max(0.1, 1.0 - (r.rank - 1) * 0.09),
      metadata: JSON.stringify({ rank: r.rank }),
      scrapedAt: r.scraped_at,
    });
  }

  // Wikipedia 한국어 인기 문서: metadata->>'keyword'
  const wikiRows = await pool.query<{
    keyword: string; views: number; scraped_at: Date;
  }>(`
    SELECT metadata->>'keyword' AS keyword,
           COALESCE((metadata->>'views')::int, 0) AS views,
           scraped_at
    FROM posts
    WHERE source_key = 'wikipedia_ko'
      AND scraped_at > NOW() - INTERVAL '36 hours'
      AND metadata->>'keyword' IS NOT NULL
  `);

  for (const r of wikiRows.rows) {
    if (!r.keyword || r.keyword.length < 2) continue;
    entries.push({
      keyword: r.keyword,
      normalized: normalizeTitle(r.keyword),
      sourceKey: 'wikipedia_ko',
      strength: Math.min(r.views / 50_000, 1.0),
      metadata: JSON.stringify({ views: r.views }),
      scrapedAt: r.scraped_at,
    });
  }

  if (entries.length === 0) return 0;

  // Batch UPSERT
  const values: string[] = [];
  const params: unknown[] = [];
  for (const e of entries) {
    const i = params.length;
    values.push(`($${i+1},$${i+2},$${i+3},$${i+4},$${i+5}::jsonb,$${i+6},$${i+7})`);
    params.push(e.keyword, e.normalized, e.sourceKey, e.strength, e.metadata, e.scrapedAt, new Date(Date.now() + 12 * 60 * 60 * 1000));
  }

  await pool.query(
    `INSERT INTO trend_keywords (keyword, keyword_normalized, source_key, signal_strength, metadata, scraped_at, expires_at)
     VALUES ${values.join(',')}
     ON CONFLICT (keyword_normalized, source_key) DO UPDATE SET
       keyword = EXCLUDED.keyword,
       signal_strength = EXCLUDED.signal_strength,
       metadata = EXCLUDED.metadata,
       scraped_at = EXCLUDED.scraped_at,
       expires_at = EXCLUDED.expires_at`,
    params
  );

  return entries.length;
}

// ─── Keyword Index (In-Memory) ───

/** trend_keywords 테이블에서 활성 키워드를 읽어 인메모리 인덱스 빌드 */
export async function buildKeywordIndex(pool: Pool): Promise<TrendKeywordEntry[]> {
  const { rows } = await pool.query<{
    keyword: string; keyword_normalized: string; source_key: string;
    signal_strength: number; scraped_at: Date;
  }>(`
    SELECT keyword, keyword_normalized, source_key, signal_strength, scraped_at
    FROM trend_keywords
    WHERE expires_at > NOW()
    ORDER BY signal_strength DESC
  `);

  return rows.map(r => ({
    keyword: r.keyword,
    normalized: r.keyword_normalized,
    sourceKey: r.source_key,
    signalStrength: r.signal_strength,
    scrapedAt: r.scraped_at,
  }));
}

// ─── Title ↔ Keyword Matching ───

function isKorean(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0xAC00 && code <= 0xD7AF) || // 한글 음절
         (code >= 0x3130 && code <= 0x318F);    // 한글 자모
}

function effectiveMinLength(keyword: string): number {
  if (!keyword || !keyword[0]) return MIN_LATIN_KEYWORD_LEN;
  return isKorean(keyword[0]) ? MIN_KOREAN_KEYWORD_LEN : MIN_LATIN_KEYWORD_LEN;
}

/** Tier 1: 부분 문자열 매칭 (공백 무시 포함) */
function substringMatch(normTitle: string, normKeyword: string): boolean {
  if (!normKeyword || normKeyword.length < effectiveMinLength(normKeyword)) return false;
  if (normTitle.includes(normKeyword)) return true;
  // 공백 제거 비교 (한국어 복합어 대응: "부동산시장" ↔ "부동산 시장")
  const strippedTitle = normTitle.replace(/\s/g, '');
  const strippedKw = normKeyword.replace(/\s/g, '');
  return strippedTitle.includes(strippedKw);
}

/** Tier 2: 방향성 바이그램 포함도 (keyword 바이그램의 70%+가 title에 포함) */
function bigramContainment(normTitle: string, normKeyword: string): boolean {
  if (normKeyword.length < 4) return false; // 바이그램 최소 3개 필요
  const kwGrams = bigrams(normKeyword);
  if (kwGrams.size === 0) return false;
  const titleGrams = bigrams(normTitle);
  let matched = 0;
  for (const g of kwGrams) {
    if (titleGrams.has(g)) matched++;
  }
  return matched / kwGrams.size >= 0.7;
}

export function matchPostToKeywords(title: string, index: readonly TrendKeywordEntry[]): MatchResult {
  const normTitle = normalizeTitle(title);
  const matchedSources = new Set<string>();
  let bestStrength = 0;
  const decays: number[] = [];
  const now = Date.now();

  for (const entry of index) {
    if (matchedSources.has(entry.sourceKey)) continue; // 소스당 1회 매칭

    const matched = substringMatch(normTitle, entry.normalized) ||
                    bigramContainment(normTitle, entry.normalized);
    if (!matched) continue;

    matchedSources.add(entry.sourceKey);
    bestStrength = Math.max(bestStrength, entry.signalStrength);

    // 시간 감쇠
    const hoursAgo = (now - entry.scrapedAt.getTime()) / (60 * 60 * 1000);
    const decay = hoursAgo <= 1 ? 1.0
      : hoursAgo <= 3 ? 0.85
      : hoursAgo <= 6 ? 0.6
      : hoursAgo <= 12 ? 0.3
      : 0.0;
    decays.push(decay);
  }

  const avgTemporalDecay = decays.length > 0
    ? decays.reduce((a, b) => a + b, 0) / decays.length
    : 0;

  return { matchedSources, bestStrength, avgTemporalDecay };
}

// ─── Bonus Calculation ───

export function computeTrendSignalBonus(match: MatchResult): number {
  const count = match.matchedSources.size;
  if (count === 0) return 1.0;

  const baseBonus = BASE_BONUS_BY_COUNT[Math.min(count, BASE_BONUS_BY_COUNT.length - 1)];
  const qualityFactor = 0.6 + 0.4 * match.bestStrength;
  const raw = baseBonus * qualityFactor * match.avgTemporalDecay;

  return Math.max(1.0, Math.min(raw, TREND_SIGNAL_BONUS_CAP));
}

// ─── Batch: 모든 포스트에 대한 trendSignalBonus Map 생성 ───

export async function calculateTrendSignalMap(
  pool: Pool,
  posts: readonly { id: number; title: string }[],
): Promise<Map<number, number>> {
  await reloadTrendSignalConfig();
  const index = await buildKeywordIndex(pool);
  if (index.length === 0) return new Map();

  const map = new Map<number, number>();
  for (const post of posts) {
    const match = matchPostToKeywords(post.title, index);
    const bonus = computeTrendSignalBonus(match);
    if (bonus > 1.0) {
      map.set(post.id, bonus);
    }
  }
  return map;
}

// ─── Cleanup ───

export async function cleanExpiredTrendKeywords(pool: Pool): Promise<number> {
  const result = await pool.query('DELETE FROM trend_keywords WHERE expires_at < NOW()');
  return result.rowCount ?? 0;
}
