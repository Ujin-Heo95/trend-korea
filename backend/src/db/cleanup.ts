import { pool } from './client.js';
import { config } from '../config/index.js';

export interface CleanupResult {
  deleted: number;
}

export async function cleanOldPosts(): Promise<CleanupResult> {
  // 공연 데이터는 주간 기준이므로 7일 TTL, 나머지는 기본 TTL
  const PERFORMANCE_TTL_DAYS = 7;

  const result = await pool.query<never>(
    `DELETE FROM posts WHERE
      (category = 'performance' AND scraped_at < NOW() - $1 * INTERVAL '1 day') OR
      (COALESCE(category, '') != 'performance' AND scraped_at < NOW() - $2 * INTERVAL '1 day')`,
    [PERFORMANCE_TTL_DAYS, config.postTtlDays]
  );
  const deleted = result.rowCount ?? 0;
  console.log(`[cleanup] deleted ${deleted} posts (performance: ${PERFORMANCE_TTL_DAYS}d, others: ${config.postTtlDays}d)`);
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

export async function cleanOldScraperRuns(): Promise<CleanupResult> {
  const result = await pool.query<never>(
    `DELETE FROM scraper_runs WHERE started_at < NOW() - $1 * INTERVAL '1 day'`,
    [config.scraperRunsTtlDays]
  );
  const deleted = result.rowCount ?? 0;
  console.log(`[cleanup] deleted ${deleted} scraper_runs older than ${config.scraperRunsTtlDays} days`);
  return { deleted };
}
