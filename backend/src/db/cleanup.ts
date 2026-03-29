import { pool } from './client.js';
import { config } from '../config/index.js';

export interface CleanupResult {
  deleted: number;
}

export async function cleanOldPosts(): Promise<CleanupResult> {
  const result = await pool.query<never>(
    `DELETE FROM posts WHERE scraped_at < NOW() - ($1 || ' days')::INTERVAL`,
    [config.postTtlDays]
  );
  const deleted = result.rowCount ?? 0;
  console.log(`[cleanup] deleted ${deleted} posts older than ${config.postTtlDays} days`);
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

export async function cleanOldScraperRuns(): Promise<CleanupResult> {
  const result = await pool.query<never>(
    `DELETE FROM scraper_runs WHERE started_at < NOW() - ($1 || ' days')::INTERVAL`,
    [config.scraperRunsTtlDays]
  );
  const deleted = result.rowCount ?? 0;
  console.log(`[cleanup] deleted ${deleted} scraper_runs older than ${config.scraperRunsTtlDays} days`);
  return { deleted };
}
