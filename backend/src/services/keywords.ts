import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { Pool } from 'pg';
import pLimit from 'p-limit';
import { config } from '../config/index.js';
import { notifyScraperErrors } from './discord.js';

let model: GenerativeModel | null = null;

function getModel(): GenerativeModel | null {
  if (!config.geminiApiKey) return null;
  if (!model) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return model;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const geminiLimit = pLimit(1);

const BATCH_SIZE = 15;
const MAX_POSTS_PER_RUN = 200;
const BATCH_DELAY_MS = 2000;

const PROMPT_TEMPLATE = `다음은 한국 커뮤니티 게시글 제목 목록이다.
각 제목에서 고유명사(인물명, 기업명, 지명, 브랜드, 작품명, 이슈 키워드)만 추출하라.
일반명사(논란, 상황, 발표 등)는 제외한다.
1글자 키워드는 제외한다.

응답 형식 (JSON 배열의 배열, 제목 순서 유지):
[["키워드1", "키워드2"], ["키워드3"], ...]

제목 목록:
`;

/**
 * Gemini Flash로 제목 배치에서 키워드 추출
 */
export async function extractKeywords(titles: readonly string[]): Promise<string[][]> {
  const m = getModel();
  if (!m) return titles.map(() => []);

  const numberedTitles = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const prompt = PROMPT_TEMPLATE + numberedTitles;

  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await m.generateContent(prompt);

      const text = result.response.text().trim();
      // JSON 블록 추출: ```json ... ``` 또는 그냥 배열
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('[keywords] no JSON array in response:', text.slice(0, 200));
        await notifyScraperErrors('keywords', [{ sourceKey: 'gemini', error: 'JSON 파싱 실패: 배열 없음' }]);
        return titles.map(() => []);
      }

      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        throw new Error('parsed result is not an array');
      }

      // 각 항목을 string[] 로 정규화, 길이 보정
      return titles.map((_, i) => {
        const item = parsed[i];
        if (!Array.isArray(item)) return [];
        return item.filter((k: unknown): k is string => typeof k === 'string' && k.length >= 2);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');

      if (is429 && attempt < MAX_RETRIES) {
        const backoff = BATCH_DELAY_MS * 2 * (attempt + 1);
        console.warn(`[keywords] rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${backoff}ms`);
        await delay(backoff);
        continue;
      }

      console.error('[keywords] extraction failed:', msg);
      await notifyScraperErrors('keywords', [{ sourceKey: 'gemini', error: msg }]);
      return titles.map(() => []);
    }
  }

  return titles.map(() => []);
}

/**
 * 아직 추출되지 않은 게시글에서 키워드를 추출하여 DB에 저장
 */
export async function processNewPosts(pool: Pool): Promise<void> {
  const { rows: pending } = await pool.query<{ id: number; title: string }>(
    `SELECT p.id, p.title FROM posts p
     LEFT JOIN keyword_extractions ke ON ke.post_id = p.id
     WHERE ke.post_id IS NULL
     ORDER BY p.scraped_at DESC
     LIMIT $1`,
    [MAX_POSTS_PER_RUN],
  );

  if (pending.length === 0) {
    console.log('[keywords] no new posts to process');
    return;
  }

  console.log(`[keywords] processing ${pending.length} posts (batch=${BATCH_SIZE}, delay=${BATCH_DELAY_MS}ms)`);
  let totalExtracted = 0;
  let quotaExhausted = false;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    if (quotaExhausted) break;

    const batch = pending.slice(i, i + BATCH_SIZE);
    const titles = batch.map(p => p.title);

    const keywords = await geminiLimit(() => extractKeywords(titles));

    // 전부 빈 배열이면 API 실패 (쿼터 초과 등) — 중단
    const hasAnyKeywords = keywords.some(k => k.length > 0);
    if (!hasAnyKeywords && batch.length > 3) {
      console.warn('[keywords] all empty results — possible quota exhaustion, stopping');
      quotaExhausted = true;
    }

    // 배치 INSERT
    const values: string[] = [];
    const params: unknown[] = [];
    for (let j = 0; j < batch.length; j++) {
      const idx = params.length;
      values.push(`($${idx + 1}, $${idx + 2}::text[])`);
      params.push(batch[j].id, keywords[j]);
    }

    if (values.length > 0 && hasAnyKeywords) {
      await pool.query(
        `INSERT INTO keyword_extractions (post_id, keywords)
         VALUES ${values.join(', ')}
         ON CONFLICT (post_id) DO NOTHING`,
        params,
      );
      totalExtracted += batch.length;
    }

    // 쿼터 보호: 배치 간 딜레이
    if (i + BATCH_SIZE < pending.length && !quotaExhausted) {
      await delay(BATCH_DELAY_MS);
    }
  }

  console.log(`[keywords] extracted keywords for ${totalExtracted} posts${quotaExhausted ? ' (stopped: quota)' : ''}`);
}

// ─── Z-Score 버스트 감지 (다음 포커스 알고리즘 영감) ───

const EMA_ALPHA = 0.1;           // 스무딩 계수: ~10회 후 안정화
const PRIOR_MEAN = 0.5;          // Bayesian prior: 평균 0.5%
const PRIOR_STDDEV = 0.3;        // Bayesian prior: 표준편차 0.3%
const MIN_SAMPLES_FOR_ZSCORE = 5; // Z-Score 신뢰를 위한 최소 관측 수
const BURST_ZSCORE_THRESHOLD = 2.0; // 2σ 이상 = 유의미한 버스트

/**
 * 3h keyword_stats를 기반으로 EMA 베이스라인 갱신
 * — 매 30분 calculateStats(pool, 3) 이후 호출
 */
export async function updateBaselines(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ keyword: string; rate: number }>(
    `SELECT keyword, rate FROM keyword_stats WHERE window_hours = 3`,
  );

  if (rows.length === 0) return 0;

  // 배치 UPSERT: EMA 갱신
  const values: string[] = [];
  const params: unknown[] = [];
  for (const row of rows) {
    const idx = params.length;
    values.push(`($${idx + 1}, $${idx + 2}, $${idx + 3})`);
    params.push(row.keyword, row.rate, PRIOR_STDDEV);
  }

  const result = await pool.query(
    `INSERT INTO keyword_baselines (keyword, mean_rate, stddev_rate, sample_count, updated_at)
     VALUES ${values.join(', ')}
     ON CONFLICT (keyword) DO UPDATE SET
       mean_rate = keyword_baselines.mean_rate * (1.0 - ${EMA_ALPHA})
                 + EXCLUDED.mean_rate * ${EMA_ALPHA},
       stddev_rate = GREATEST(
         SQRT(
           keyword_baselines.stddev_rate * keyword_baselines.stddev_rate * (1.0 - ${EMA_ALPHA})
           + ${EMA_ALPHA} * (EXCLUDED.mean_rate - keyword_baselines.mean_rate)
                          * (EXCLUDED.mean_rate - keyword_baselines.mean_rate)
         ),
         0.05
       ),
       sample_count = keyword_baselines.sample_count + 1,
       updated_at = NOW()`,
    params,
  );

  const updated = result.rowCount ?? 0;
  console.log(`[keywords] baselines updated: ${updated} keywords (EMA α=${EMA_ALPHA})`);
  return updated;
}

/**
 * 현재 3h rate가 베이스라인 대비 Z-Score > threshold인 키워드 반환
 * @returns Map<keyword, zScore>
 */
export async function detectBursts(pool: Pool): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ keyword: string; z_score: number }>(`
    SELECT ks.keyword,
      CASE
        WHEN kb.stddev_rate > 0 AND kb.sample_count >= ${MIN_SAMPLES_FOR_ZSCORE}
          THEN (ks.rate - kb.mean_rate) / kb.stddev_rate
        ELSE (ks.rate - ${PRIOR_MEAN}) / ${PRIOR_STDDEV}
      END AS z_score
    FROM keyword_stats ks
    LEFT JOIN keyword_baselines kb ON kb.keyword = ks.keyword
    WHERE ks.window_hours = 3
    ORDER BY z_score DESC
    LIMIT 50
  `);

  const bursts = new Map<string, number>();
  for (const r of rows) {
    if (r.z_score >= BURST_ZSCORE_THRESHOLD) {
      bursts.set(r.keyword, Math.round(r.z_score * 100) / 100);
    }
  }

  if (bursts.size > 0) {
    const top3 = [...bursts.entries()].slice(0, 3).map(([kw, z]) => `${kw}(${z})`).join(', ');
    console.log(`[keywords] bursts detected: ${bursts.size} keywords (top: ${top3})`);
  }

  return bursts;
}

/**
 * 시간 윈도우 내 키워드 빈도 집계 → keyword_stats UPSERT
 */
export async function calculateStats(pool: Pool, windowHours: number): Promise<void> {
  // 전체 게시글 수
  const { rows: [{ total }] } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM posts
     WHERE scraped_at > NOW() - INTERVAL '1 hour' * $1`,
    [windowHours],
  );

  if (total === 0) {
    console.log(`[keywords] no posts in ${windowHours}h window`);
    return;
  }

  // 키워드별 언급 수 (상위 100개)
  const { rows: stats } = await pool.query<{ keyword: string; cnt: number }>(
    `SELECT unnest(ke.keywords) AS keyword, COUNT(DISTINCT ke.post_id)::int AS cnt
     FROM keyword_extractions ke
     JOIN posts p ON p.id = ke.post_id
     WHERE p.scraped_at > NOW() - INTERVAL '1 hour' * $1
     GROUP BY keyword
     ORDER BY cnt DESC
     LIMIT 100`,
    [windowHours],
  );

  if (stats.length === 0) return;

  // UPSERT keyword_stats
  const values: string[] = [];
  const params: unknown[] = [];
  for (const row of stats) {
    const idx = params.length;
    const rate = Math.round((row.cnt / total) * 10000) / 100; // 소수점 2자리 %
    values.push(`($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, NOW())`);
    params.push(row.keyword, row.cnt, rate, windowHours, total);
  }

  await pool.query(
    `INSERT INTO keyword_stats (keyword, mention_count, rate, window_hours, total_posts, calculated_at)
     VALUES ${values.join(', ')}
     ON CONFLICT (keyword, window_hours) DO UPDATE SET
       mention_count = EXCLUDED.mention_count,
       rate = EXCLUDED.rate,
       total_posts = EXCLUDED.total_posts,
       calculated_at = EXCLUDED.calculated_at`,
    params,
  );

  // 이번 집계에 없는 오래된 키워드 정리
  await pool.query(
    `DELETE FROM keyword_stats
     WHERE window_hours = $1 AND calculated_at < NOW() - INTERVAL '1 hour'`,
    [windowHours],
  );

  console.log(`[keywords] stats updated: ${stats.length} keywords for ${windowHours}h window (${total} posts)`);
}
