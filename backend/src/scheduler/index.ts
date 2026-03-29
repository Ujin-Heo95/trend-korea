import cron from 'node-cron';
import { runAllScrapers, runScrapersByPriority } from '../scrapers/index.js';
import { cleanOldPosts, cleanOldScraperRuns } from '../db/cleanup.js';
import { calculateScores } from '../services/scoring.js';
import { pool } from '../db/client.js';

const PRIORITY_INTERVALS = {
  high: 10,   // 커뮤니티, 트렌딩
  medium: 15, // 뉴스 RSS
  low: 30,    // 정부, 기상청
} as const;

export function startScheduler(): void {
  console.log(`[scheduler] priority intervals: high=${PRIORITY_INTERVALS.high}min, medium=${PRIORITY_INTERVALS.medium}min, low=${PRIORITY_INTERVALS.low}min`);
  console.log(`[scheduler] cleanup: twice daily (00:00, 12:00 UTC)`);

  // 최초 실행: 전체 스크래퍼 1회
  runAllScrapers().catch(console.error);

  // 우선순위별 cron
  for (const [priority, minutes] of Object.entries(PRIORITY_INTERVALS)) {
    cron.schedule(`*/${minutes} * * * *`, () => {
      runScrapersByPriority(priority as keyof typeof PRIORITY_INTERVALS).catch(console.error);
    });
  }

  // 트렌드 스코어 갱신: 5분 주기
  cron.schedule('*/5 * * * *', () => {
    calculateScores(pool).catch(err => console.error('[scoring] error:', err));
  });

  // 자정 + 정오 2회 (Railway 서버 = UTC 기준) — DB 100MB 한도 대응
  cron.schedule('0 0,12 * * *', () => {
    cleanOldPosts().catch(err => console.error('[cleanup:posts] error:', err));
    cleanOldScraperRuns().catch(err => console.error('[cleanup:scraper_runs] error:', err));
  });
}
