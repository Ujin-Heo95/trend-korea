import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const migrations = [
  '001_init.sql',
  '002_scraper_runs.sql',
  '003_add_category.sql',
  '004_backfill_category.sql',
  '005_add_composite_index.sql',
  '006_dedup.sql',
  '007_scoring.sql',
  '008_daily_reports.sql',
  '009_split_entertainment.sql',
  '010_keywords.sql',
  '011_trend_signals.sql',
  '012_movie_performance_indexes.sql',
  '013_engagement_snapshots.sql',
  '014_trend_signal_context.sql',
  '015_apify_usage.sql',
  '016_editorial.sql',
  '017_post_votes.sql',
];

try {
  for (const file of migrations) {
    const sql = readFileSync(join(__dirname, 'migrations', file), 'utf-8');
    await pool.query(sql);
    console.log(`Migration applied: ${file}`);
  }
  console.log('All migrations complete');
} catch (err) {
  console.error('Migration failed:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
} finally {
  await pool.end();
}
