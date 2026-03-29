import cron from 'node-cron';
import { runAllScrapers, runScrapersByPriority } from '../scrapers/index.js';
import { cleanOldPosts, cleanOldScraperRuns } from '../db/cleanup.js';

const PRIORITY_INTERVALS = {
  high: 10,   // 커뮤니티, 트렌딩
  medium: 15, // 뉴스 RSS
  low: 30,    // 정부, 기상청
} as const;

export function startScheduler(): void {
  console.log(`[scheduler] priority intervals: high=${PRIORITY_INTERVALS.high}min, medium=${PRIORITY_INTERVALS.medium}min, low=${PRIORITY_INTERVALS.low}min`);
  console.log(`[scheduler] cleanup: daily at midnight`);

  // 최초 실행: 전체 스크래퍼 1회
  runAllScrapers().catch(console.error);

  // 우선순위별 cron
  for (const [priority, minutes] of Object.entries(PRIORITY_INTERVALS)) {
    cron.schedule(`*/${minutes} * * * *`, () => {
      runScrapersByPriority(priority as keyof typeof PRIORITY_INTERVALS).catch(console.error);
    });
  }

  // 매일 자정 (Railway 서버 = UTC 기준)
  cron.schedule('0 0 * * *', () => {
    cleanOldPosts().catch(err => console.error('[cleanup:posts] error:', err));
    cleanOldScraperRuns().catch(err => console.error('[cleanup:scraper_runs] error:', err));
  });
}
