import { pool } from '../db/client.js';
import { config } from '../config/index.js';
import { RssScraper, RSS_SOURCES } from './rss.js';
import { DcinsideScraper } from './dcinside.js';
import { FmkoreaScraper } from './fmkorea.js';
import { RuliwebScraper } from './ruliweb.js';
import { TheqooScraper } from './theqoo.js';
import { InstizScraper } from './instiz.js';
import { NatepannScraper } from './natepann.js';
import { YoutubeScraper } from './youtube.js';

export async function runAllScrapers(): Promise<void> {
  const scrapers = [
    new DcinsideScraper(pool),
    new FmkoreaScraper(pool),
    new RuliwebScraper(pool),
    new TheqooScraper(pool),
    new InstizScraper(pool),
    new NatepannScraper(pool),
    new YoutubeScraper(pool, config.youtubeApiKey),
    ...RSS_SOURCES.map(s => new RssScraper({ ...s, pool })),
  ];

  const results = await Promise.allSettled(scrapers.map(s => s.run()));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') console.log(`[scraper ${i}] saved: ${r.value.count}`);
    else console.error(`[scraper ${i}] failed:`, r.reason);
  });
}
