import cron from 'node-cron';
import { config } from '../config/index.js';
import { runAllScrapers } from '../scrapers/index.js';
import { cleanOldPosts } from '../db/cleanup.js';

export function startScheduler(): void {
  console.log(`[scheduler] scrape interval: every ${config.crawlIntervalMinutes}min`);
  console.log(`[scheduler] cleanup: daily at midnight, TTL=${config.postTtlDays} days`);

  runAllScrapers().catch(console.error);
  cron.schedule(`*/${config.crawlIntervalMinutes} * * * *`, () => {
    runAllScrapers().catch(console.error);
  });

  // 매일 자정 (Railway 서버 = UTC 기준)
  cron.schedule('0 0 * * *', () => {
    cleanOldPosts().catch(err => console.error('[cleanup] error:', err));
  });
}
