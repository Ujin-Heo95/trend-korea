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
