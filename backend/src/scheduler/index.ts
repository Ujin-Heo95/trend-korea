import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { runAllScrapers, runScrapersByPriority, runApifyScrapers } from '../scrapers/index.js';
import { cleanOldPosts, cleanOldScraperRuns, cleanOldEngagementSnapshots, cleanNumericTitlePosts } from '../db/cleanup.js';
import { calculateScores } from '../services/scoring.js';
import { extractTrendKeywords, cleanExpiredTrendKeywords } from '../services/trendSignals.js';
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

  // 최초 실행: 전체 스크래퍼 1회
  runAllScrapers().catch(captureError);

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

  // 트렌드 키워드 추출: 15분 주기 (외부 소스 → trend_keywords 테이블)
  cron.schedule('*/15 * * * *', () => {
    extractTrendKeywords(pool).catch(captureError);
  });

  // Apify SNS 수집: 09:00, 18:00 KST (= 00:00, 09:00 UTC)
  cron.schedule('0 0,9 * * *', () => {
    runApifyScrapers().catch(captureError);
  });
  console.log('[scheduler] apify SNS: 00:00, 09:00 UTC (09:00, 18:00 KST)');

  // 자정 + 정오 2회 (Railway 서버 = UTC 기준) — DB 100MB 한도 대응
  cron.schedule('0 0,12 * * *', () => {
    cleanOldPosts().catch(captureError);
    cleanNumericTitlePosts().catch(captureError);
    cleanOldScraperRuns().catch(captureError);
    cleanOldEngagementSnapshots().catch(captureError);
    cleanExpiredTrendKeywords(pool).catch(captureError);
    checkDbSize(pool).catch(captureError);
  });
}
