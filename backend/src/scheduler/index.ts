import cron from 'node-cron';
import { config } from '../config/index.js';
import { runAllScrapers } from '../scrapers/index.js';

export function startScheduler(): void {
  console.log(`[scheduler] every ${config.crawlIntervalMinutes}min`);
  runAllScrapers().catch(console.error);
  cron.schedule(`*/${config.crawlIntervalMinutes} * * * *`, () => {
    runAllScrapers().catch(console.error);
  });
}
