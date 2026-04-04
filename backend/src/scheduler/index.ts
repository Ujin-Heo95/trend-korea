import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { runAllScrapers, runScrapersByPriority, runApifyScrapers } from '../scrapers/index.js';
import { cleanOldPosts, cleanOldScraperRuns, cleanExpiredTrendSignals, cleanOldEngagementSnapshots, cleanNumericTitlePosts } from '../db/cleanup.js';
import { calculateScores } from '../services/scoring.js';
import { generateDailyReport } from '../services/dailyReport.js';
import { crossValidate, validateBurstKeywords } from '../services/trendCrossValidator.js';
import { processNewPosts, calculateStats, updateBaselines, generateBurstExplanations } from '../services/keywords.js';
import { summarizeNewPosts } from '../services/summaries.js';
import { generateMiniEditorial } from '../services/miniEditorial.js';
import { generateAndSaveWeeklyDigest } from '../services/weeklyDigest.js';
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

  // 최초 실행: 전체 스크래퍼 1회 → 통계만 (Gemini 호출 없음, 1시간 배치에서 처리)
  runAllScrapers()
    .then(async () => {
      await calculateStats(pool, 1);
      await calculateStats(pool, 3);
      await updateBaselines(pool);
      await calculateStats(pool, 24);
    })
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

  // 키워드 통계만 갱신: 30분 주기 (Gemini 호출 없음)
  cron.schedule('*/30 * * * *', async () => {
    try {
      await calculateStats(pool, 1);
      await calculateStats(pool, 3);
      await updateBaselines(pool);
      await calculateStats(pool, 24);
    } catch (err) {
      captureError(err);
    }
  });
  console.log('[scheduler] keyword stats: every 30 min (no Gemini)');

  // Gemini AI 배치: 1시간 주기 (07:00~02:00 KST = UTC 22-23,0-17)
  // 키워드 추출 + AI 요약 + 버스트 설명 + 미니 에디토리얼
  cron.schedule('0 0-17,22-23 * * *', async () => {
    try {
      console.log('[scheduler] hourly AI batch started');
      await processNewPosts(pool);
      await summarizeNewPosts(pool);
      await generateBurstExplanations(pool);
      await validateBurstKeywords(pool);
      await generateMiniEditorial(pool);
      console.log('[scheduler] hourly AI batch complete');
    } catch (err) {
      captureError(err);
    }
  });
  console.log('[scheduler] AI batch: hourly 07:00-02:00 KST (UTC 22-23,0-17)');

  // 교차 검증 트렌드: BigKinds와 병행 (검색+커뮤니티 수렴 신호)
  cron.schedule('*/20 * * * *', () => {
    crossValidate(pool).catch(err => captureError(err));
  });
  console.log('[scheduler] cross-validate: every 20 min');

  // Apify SNS 수집: 09:00, 18:00 KST (= 00:00, 09:00 UTC)
  cron.schedule('0 0,9 * * *', () => {
    runApifyScrapers().catch(captureError);
  });
  console.log('[scheduler] apify SNS: 00:00, 09:00 UTC (09:00, 18:00 KST)');

  // 주간 다이제스트: 일요일 23:00 UTC (= 월요일 08:00 KST)
  cron.schedule('0 23 * * 0', () => {
    generateAndSaveWeeklyDigest(pool).catch(captureError);
  });
  console.log('[scheduler] weekly digest: Sunday 23:00 UTC (Mon 08:00 KST)');

  // 자정 + 정오 2회 (Railway 서버 = UTC 기준) — DB 100MB 한도 대응
  cron.schedule('0 0,12 * * *', () => {
    cleanOldPosts().catch(captureError);
    cleanNumericTitlePosts().catch(captureError);
    cleanOldScraperRuns().catch(captureError);
    cleanExpiredTrendSignals().catch(captureError);
    cleanOldEngagementSnapshots().catch(captureError);
    checkDbSize(pool).catch(captureError);
  });
}
