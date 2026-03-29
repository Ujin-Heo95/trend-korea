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
