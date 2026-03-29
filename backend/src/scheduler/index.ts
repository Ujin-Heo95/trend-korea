import cron from 'node-cron';
import { runAllScrapers, runScrapersByPriority } from '../scrapers/index.js';
import { cleanOldPosts, cleanOldScraperRuns, cleanExpiredTrendSignals, cleanOldEngagementSnapshots } from '../db/cleanup.js';
import { calculateScores } from '../services/scoring.js';
import { generateDailyReport } from '../services/dailyReport.js';
import { crossValidate } from '../services/trendCrossValidator.js';
import { processNewPosts, calculateStats } from '../services/keywords.js';
import { pool } from '../db/client.js';

const PRIORITY_INTERVALS = {
  high: 10,   // 커뮤니티, 트렌딩
  medium: 15, // 뉴스 RSS
  low: 30,    // 정부, 기상청
} as const;

export function startScheduler(): void {
  console.log(`[scheduler] priority intervals: high=${PRIORITY_INTERVALS.high}min, medium=${PRIORITY_INTERVALS.medium}min, low=${PRIORITY_INTERVALS.low}min`);
  console.log(`[scheduler] cleanup: twice daily (00:00, 12:00 UTC)`);

  // 최초 실행: 전체 스크래퍼 1회 → 키워드 추출도 연이어 실행
  runAllScrapers()
    .then(() => processNewPosts(pool))
    .then(() => Promise.all([calculateStats(pool, 3), calculateStats(pool, 24)]))
    .catch(console.error);

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

  // 일일 리포트: 매일 UTC 22:00 = KST 07:00
  cron.schedule('0 22 * * *', () => {
    generateDailyReport(pool).catch(err =>
      console.error('[daily-report] generation failed:', err),
    );
  });
  console.log('[scheduler] daily report: 22:00 UTC (07:00 KST)');

  // 키워드 추출 + 통계 집계: 30분 주기
  cron.schedule('*/30 * * * *', async () => {
    try {
      await processNewPosts(pool);
      await calculateStats(pool, 3);
      await calculateStats(pool, 24);
    } catch (err) {
      console.error('[keywords] cron error:', err);
    }
  });
  console.log('[scheduler] keywords: every 30 min');

  // 교차 검증 트렌드: 20분 주기
  cron.schedule('*/20 * * * *', () => {
    crossValidate(pool).catch(err => console.error('[cross-validate] error:', err));
  });
  console.log('[scheduler] cross-validate: every 20 min');

  // 자정 + 정오 2회 (Railway 서버 = UTC 기준) — DB 100MB 한도 대응
  cron.schedule('0 0,12 * * *', () => {
    cleanOldPosts().catch(err => console.error('[cleanup:posts] error:', err));
    cleanOldScraperRuns().catch(err => console.error('[cleanup:scraper_runs] error:', err));
    cleanExpiredTrendSignals().catch(err => console.error('[cleanup:trend_signals] error:', err));
    cleanOldEngagementSnapshots().catch(err => console.error('[cleanup:engagement_snapshots] error:', err));
  });
}
