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
  '018_bigint_fk.sql',
  '019_keyword_baselines.sql',
  '020_trend_rankings.sql',
  '021_seed_suppressions.sql',
  '022_post_summaries.sql',
  '023_burst_explanations.sql',
  '024_mini_editorials.sql',
  '027_like_count.sql',
  '028_news_subcategory.sql',
  '029_backfill_news_subcategory.sql',
];

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const file of migrations) {
    const { rows } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file],
    );
    if (rows.length > 0) {
      console.log(`Migration already applied, skipping: ${file}`);
      continue;
    }

    const sql = readFileSync(join(__dirname, 'migrations', file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file],
      );
      await client.query('COMMIT');
      console.log(`Migration applied: ${file}`);
    } catch (migrationErr) {
      await client.query('ROLLBACK');
      throw migrationErr;
    } finally {
      client.release();
    }
  }
  console.log('All migrations complete');
} catch (err) {
  console.error('Migration failed:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
} finally {
  await pool.end();
}
