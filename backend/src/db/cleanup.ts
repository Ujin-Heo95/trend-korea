import { pool } from './client.js';
import { config } from '../config/index.js';

export interface CleanupResult {
  deleted: number;
}

export async function cleanOldPosts(): Promise<CleanupResult> {
  // 공연/도서/OTT 데이터는 주간 기준이므로 7일 TTL, 나머지는 기본 TTL
  const RANKED_TTL_DAYS = 7;
  const RANKED_CATEGORIES = ['performance', 'books', 'ott'];

  const result = await pool.query<never>(
    `DELETE FROM posts WHERE
      (category = ANY($1::text[]) AND scraped_at < NOW() - $2 * INTERVAL '1 day') OR
      (NOT (category = ANY($1::text[])) AND scraped_at < NOW() - $3 * INTERVAL '1 day')`,
    [RANKED_CATEGORIES, RANKED_TTL_DAYS, config.postTtlDays]
  );
  const deleted = result.rowCount ?? 0;
  console.log(`[cleanup] deleted ${deleted} posts (ranked: ${RANKED_TTL_DAYS}d, others: ${config.postTtlDays}d)`);
  return { deleted };
}

export async function cleanExpiredTrendSignals(): Promise<CleanupResult> {
  const result = await pool.query<never>(
    `DELETE FROM trend_signals WHERE expires_at < NOW()`,
  );
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) console.log(`[cleanup] deleted ${deleted} expired trend_signals`);
  return { deleted };
}

export async function cleanOldEngagementSnapshots(): Promise<CleanupResult> {
  const result = await pool.query<never>(
    `DELETE FROM engagement_snapshots WHERE captured_at < NOW() - INTERVAL '6 hours'`,
  );
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) console.log(`[cleanup] deleted ${deleted} engagement_snapshots older than 6h`);
  return { deleted };
}

export async function cleanNumericTitlePosts(): Promise<CleanupResult> {
  const result = await pool.query<never>(
    `DELETE FROM posts WHERE source_key = 'cook82' AND title ~ '^\\d+$'`,
  );
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) console.log(`[cleanup] deleted ${deleted} cook82 numeric-title posts`);
  return { deleted };
}

export async function cleanOldScraperRuns(): Promise<CleanupResult> {
  const result = await pool.query<never>(
    `DELETE FROM scraper_runs WHERE started_at < NOW() - $1 * INTERVAL '1 day'`,
    [config.scraperRunsTtlDays]
  );
  const deleted = result.rowCount ?? 0;
  console.log(`[cleanup] deleted ${deleted} scraper_runs older than ${config.scraperRunsTtlDays} days`);
  return { deleted };
}
