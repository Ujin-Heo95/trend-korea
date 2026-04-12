/**
 * Persistent fingerprint-based cache for Gemini issue summaries.
 *
 * Fingerprint = md5(sorted top-5 post_ids). Stable across restarts and
 * multi-instance deploys (vs the in-memory Map in geminiSummarizer.ts).
 *
 * Member-change rate ≥ 0.3 invalidates a hit so the cluster gets re-summarized
 * once it drifts meaningfully — a single member swap on a 5-id top-list is
 * exactly 1 - 4/6 ≈ 0.33, so one swap triggers a refresh.
 */
import crypto from 'crypto';
import type { Pool } from 'pg';
import type { IssueSummary } from './geminiSummarizer.js';

const MEMBER_CHANGE_REFRESH_THRESHOLD = 0.3;
const TOP_N = 5;

export interface CacheLookupResult {
  readonly summary: IssueSummary;
  readonly hitCount: number;
}

export function computeFingerprint(allPostIds: readonly number[]): string {
  const top = [...new Set(allPostIds)].sort((a, b) => a - b).slice(0, TOP_N);
  return crypto.createHash('md5').update(top.join(',')).digest('hex');
}

export function topPostIdsFor(allPostIds: readonly number[]): number[] {
  return [...new Set(allPostIds)].sort((a, b) => a - b).slice(0, TOP_N);
}

/** Jaccard distance over the top-N post_id sets. */
export function memberChangeRate(
  cached: readonly number[],
  current: readonly number[],
): number {
  if (cached.length === 0 && current.length === 0) return 0;
  const a = new Set(cached);
  const b = new Set(current);
  let intersect = 0;
  for (const id of a) if (b.has(id)) intersect++;
  const unionSize = a.size + b.size - intersect;
  if (unionSize === 0) return 0;
  return 1 - intersect / unionSize;
}

interface DbCacheRow {
  title: string;
  category: string;
  summary: string;
  quality_score: number | null;
  keywords: unknown;
  sentiment: string | null;
  top_post_ids: string[] | number[];
  hit_count: number;
}

export async function getCachedSummary(
  pool: Pool,
  fingerprint: string,
  currentTopPostIds: readonly number[],
): Promise<CacheLookupResult | null> {
  const { rows } = await pool.query<DbCacheRow>(
    `SELECT title, category, summary, quality_score, keywords, sentiment,
            top_post_ids, hit_count
       FROM issue_summary_cache
      WHERE fingerprint = $1`,
    [fingerprint],
  );
  if (rows.length === 0) return null;

  const r = rows[0];
  const cachedIds = (r.top_post_ids ?? []).map(Number);
  const change = memberChangeRate(cachedIds, currentTopPostIds);
  if (change >= MEMBER_CHANGE_REFRESH_THRESHOLD) return null;

  // Touch — non-blocking, ignore errors
  pool.query(
    `UPDATE issue_summary_cache
        SET last_hit_at = NOW(), hit_count = hit_count + 1
      WHERE fingerprint = $1`,
    [fingerprint],
  ).catch((err) => {
    console.warn('[issueSummaryCache] touch failed:', (err as Error).message);
  });

  return {
    summary: {
      title: r.title,
      category: r.category,
      summary: r.summary,
      qualityScore: r.quality_score,
      keywords: Array.isArray(r.keywords) ? (r.keywords as string[]).slice(0, 5) : [],
      sentiment: r.sentiment,
    },
    hitCount: r.hit_count,
  };
}

export async function setCachedSummary(
  pool: Pool,
  fingerprint: string,
  summary: IssueSummary,
  topPostIds: readonly number[],
  model = 'gemini-2.5-flash',
): Promise<void> {
  await pool.query(
    `INSERT INTO issue_summary_cache
       (fingerprint, title, category, summary, quality_score, keywords,
        sentiment, top_post_ids, model, last_hit_at, hit_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 1)
     ON CONFLICT (fingerprint) DO UPDATE
       SET title         = EXCLUDED.title,
           category      = EXCLUDED.category,
           summary       = EXCLUDED.summary,
           quality_score = EXCLUDED.quality_score,
           keywords      = EXCLUDED.keywords,
           sentiment     = EXCLUDED.sentiment,
           top_post_ids  = EXCLUDED.top_post_ids,
           model         = EXCLUDED.model,
           last_hit_at   = NOW(),
           hit_count     = issue_summary_cache.hit_count + 1`,
    [
      fingerprint,
      summary.title,
      summary.category,
      summary.summary,
      summary.qualityScore,
      JSON.stringify(summary.keywords ?? []),
      summary.sentiment,
      [...topPostIds],
      model,
    ],
  );
}
