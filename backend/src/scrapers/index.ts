import pLimit from 'p-limit';
import { pool } from '../db/client.js';
import { buildScrapers, getSourcesByPriority } from './registry.js';
import type { ResolvedScraper, SourcePriority } from './registry.js';

async function logRunStart(sourceKey: string): Promise<number> {
  const r = await pool.query<{ id: number }>(
    `INSERT INTO scraper_runs (source_key, started_at) VALUES ($1, NOW()) RETURNING id`,
    [sourceKey]
  );
  return r.rows[0].id;
}

async function logRunEnd(runId: number, postsSaved: number, errorMessage: string | null): Promise<void> {
  await pool.query(
    `UPDATE scraper_runs SET finished_at = NOW(), posts_saved = $1, error_message = $2 WHERE id = $3`,
    [postsSaved, errorMessage, runId]
  );
}

async function runScraper(entry: ResolvedScraper): Promise<void> {
  let runId: number | null = null;
  try {
    runId = await logRunStart(entry.sourceKey);
    const result = await entry.scraper.run();
    await logRunEnd(runId, result.count, result.error ?? null);
    if (result.error) {
      console.error(`[scraper:${entry.sourceKey}] saved: ${result.count} err: ${result.error}`);
    } else {
      console.log(`[scraper:${entry.sourceKey}] saved: ${result.count}`);
    }
  } catch (err) {
    const msg = String(err);
    console.error(`[scraper:${entry.sourceKey}] fatal:`, msg);
    if (runId !== null) {
      await logRunEnd(runId, 0, msg).catch(() => {});
    }
  }
}

export async function runScrapersByPriority(priority: SourcePriority): Promise<void> {
  const all = await buildScrapers(pool);
  const entries = all.filter(s => s.priority === priority);
  if (entries.length === 0) return;

  console.log(`[scheduler] running ${entries.length} ${priority}-priority scrapers`);
  const limit = pLimit(4);
  const results = await Promise.allSettled(entries.map(e => limit(() => runScraper(e))));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[scraper:${entries[i].sourceKey}] unhandled rejection:`, r.reason);
    }
  });
}

export async function runAllScrapers(): Promise<void> {
  const entries = await buildScrapers(pool);
  console.log(`[scheduler] running all ${entries.length} scrapers`);
  const limit = pLimit(4);
  const results = await Promise.allSettled(entries.map(e => limit(() => runScraper(e))));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[scraper:${entries[i].sourceKey}] unhandled rejection:`, r.reason);
    }
  });
}
