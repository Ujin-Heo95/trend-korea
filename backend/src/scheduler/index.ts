import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { runAllScrapers, runScrapersByPriority, runApifyScrapers } from '../scrapers/index.js';
import { cleanOldPosts, cleanOldScraperRuns, cleanExpiredTrendSignals, cleanOldEngagementSnapshots } from '../db/cleanup.js';
import { calculateScores } from '../services/scoring.js';
import { generateDailyReport } from '../services/dailyReport.js';
// BigKinds Top 10 전환으로 비활성화 — 추후 재활용 가능
// import { crossValidate } from '../services/trendCrossValidator.js';
import { processNewPosts, calculateStats } from '../services/keywords.js';
import { checkDbSize } from '../services/dbMonitor.js';
import { pool } from '../db/client.js';

function captureError(err: unknown): void {
  console.error(err);
  Sentry.captureException(err);
}

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
    .catch(captureError);

  // 우선순위별 cron
  for (const [priority, minutes] of Object.entries(PRIORITY_INTERVALS)) {
    cron.schedule(`*/${minutes} * * * *`, () => {
      runScrapersByPriority(priority as keyof typeof PRIORITY_INTERVALS).catch(captureError);
    });
  }

  // 트렌드 스코어 갱신: 5분 주기
  cron.schedule('*/5 * * * *', () => {
    calculateScores(pool).catch(err => captureError(err));
  });

  // 일일 리포트: 매일 UTC 22:00 = KST 07:00
  cron.schedule('0 22 * * *', () => {
    generateDailyReport(pool).catch(err =>
      captureError(err),
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
      captureError(err);
    }
  });
  console.log('[scheduler] keywords: every 30 min');

  // 교차 검증 트렌드: BigKinds Top 10 전환으로 비활성화
  // cron.schedule('*/20 * * * *', () => {
  //   crossValidate(pool).catch(err => captureError(err));
  // });
  // console.log('[scheduler] cross-validate: every 20 min');

  // Apify SNS 수집: 09:00, 18:00 KST (= 00:00, 09:00 UTC)
  cron.schedule('0 0,9 * * *', () => {
    runApifyScrapers().catch(captureError);
  });
  console.log('[scheduler] apify SNS: 00:00, 09:00 UTC (09:00, 18:00 KST)');

  // 자정 + 정오 2회 (Railway 서버 = UTC 기준) — DB 100MB 한도 대응
  cron.schedule('0 0,12 * * *', () => {
    cleanOldPosts().catch(captureError);
    cleanOldScraperRuns().catch(captureError);
    cleanExpiredTrendSignals().catch(captureError);
    cleanOldEngagementSnapshots().catch(captureError);
    checkDbSize(pool).catch(captureError);
  });
}
