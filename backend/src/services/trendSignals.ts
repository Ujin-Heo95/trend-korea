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
  readonly matchedKeywords: ReadonlySet<string>;
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
    LIMIT 500
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
  const matchedKeywords = new Set<string>();
  let bestStrength = 0;
  const decays: number[] = [];
  const now = Date.now();

  for (const entry of index) {
    if (matchedSources.has(entry.sourceKey)) continue; // 소스당 1회 매칭

    const matched = substringMatch(normTitle, entry.normalized) ||
                    bigramContainment(normTitle, entry.normalized);
    if (!matched) continue;

    matchedSources.add(entry.sourceKey);
    matchedKeywords.add(entry.keyword);
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

  return { matchedSources, matchedKeywords, bestStrength, avgTemporalDecay };
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
