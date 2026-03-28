import { pool } from '../db/client.js';
import { config } from '../config/index.js';
import { RssScraper, RSS_SOURCES } from './rss.js';
import { DcinsideScraper }  from './dcinside.js';
import { FmkoreaScraper }   from './fmkorea.js';
import { RuliwebScraper }   from './ruliweb.js';
import { TheqooScraper }    from './theqoo.js';
import { InstizScraper }    from './instiz.js';
import { NatepannScraper }  from './natepann.js';
import { YoutubeScraper }   from './youtube.js';
import type { BaseScraper } from './base.js';

interface ScraperEntry {
  sourceKey: string;
  scraper: BaseScraper;
}

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

async function runScraper(entry: ScraperEntry): Promise<void> {
  const runId = await logRunStart(entry.sourceKey);
  try {
    const result = await entry.scraper.run();
    await logRunEnd(runId, result.count, result.error ?? null);
    console.log(`[scraper:${entry.sourceKey}] saved: ${result.count}${result.error ? ` err: ${result.error}` : ''}`);
  } catch (err) {
    const msg = String(err);
    await logRunEnd(runId, 0, msg).catch(() => {});
    console.error(`[scraper:${entry.sourceKey}] fatal:`, msg);
  }
}

export async function runAllScrapers(): Promise<void> {
  const entries: ScraperEntry[] = [
    { sourceKey: 'dcinside',   scraper: new DcinsideScraper(pool) },
    { sourceKey: 'fmkorea',    scraper: new FmkoreaScraper(pool) },
    { sourceKey: 'ruliweb',    scraper: new RuliwebScraper(pool) },
    { sourceKey: 'theqoo',     scraper: new TheqooScraper(pool) },
    { sourceKey: 'instiz',     scraper: new InstizScraper(pool) },
    { sourceKey: 'natepann',   scraper: new NatepannScraper(pool) },
    { sourceKey: 'youtube',    scraper: new YoutubeScraper(pool, config.youtubeApiKey) },
    ...RSS_SOURCES.map(s => ({ sourceKey: s.sourceKey, scraper: new RssScraper({ ...s, pool }) })),
  ];
  await Promise.allSettled(entries.map(e => runScraper(e)));
}
