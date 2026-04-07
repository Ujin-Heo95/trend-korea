import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { runAllScrapers, runScrapersByPriority, runApifyScrapers } from '../scrapers/index.js';
import { cleanOldPosts, cleanOldScraperRuns, cleanOldEngagementSnapshots, cleanNumericTitlePosts } from '../db/cleanup.js';
import { calculateScores } from '../services/scoring.js';
import { cleanExpiredTrendKeywords } from '../services/trendSignals.js';
import { aggregateIssues, snapshotRankings, cleanExpiredIssueRankings } from '../services/issueAggregator.js';
import { summarizeAndUpdateIssues } from '../services/geminiSummarizer.js';
import { crossValidateIssues } from '../services/crossValidator.js';
import { checkDbSize } from '../services/dbMonitor.js';
import { performDatabaseBackup } from '../services/backup.js';
import { notifyBackupResult } from '../services/discord.js';
import { pool } from '../db/client.js';

function captureError(err: unknown): void {
  console.error(err);
  Sentry.captureException(err);
}

/** KST 02:00-06:00 = UTC 17:00-21:00 */
function isQuietHours(): boolean {
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  return kstHour >= 2 && kstHour < 6;
}

const PRIORITY_INTERVALS = {
  high: 10,   // 커뮤니티, 트렌딩
  medium: 15, // 뉴스 RSS
  low: 30,    // 정부, 기상청
} as const;

export function startScheduler(): void {
  console.log(`[scheduler] priority intervals: high=${PRIORITY_INTERVALS.high}min, medium=${PRIORITY_INTERVALS.medium}min, low=${PRIORITY_INTERVALS.low}min`);
  console.log(`[scheduler] cleanup: twice daily (00:00, 12:00 UTC)`);
  console.log(`[scheduler] quiet hours: 02:00-06:00 KST (issue aggregation paused)`);

  // 최초 실행: 전체 스크래퍼 1회
  runAllScrapers().catch(captureError);

  // 우선순위별 cron
  for (const [priority, minutes] of Object.entries(PRIORITY_INTERVALS)) {
    cron.schedule(`*/${minutes} * * * *`, () => {
      runScrapersByPriority(priority as keyof typeof PRIORITY_INTERVALS).catch(captureError);
    });
  }

  // 트렌드 스코어 갱신 + 이슈 집계 + Gemini 요약: 10분 주기 (quiet hours 제외)
  cron.schedule('*/10 * * * *', async () => {
    if (isQuietHours()) {
      console.log('[scheduler] quiet hours (02-06 KST) — skipping issue pipeline');
      return;
    }
    await calculateScores(pool).catch(captureError);
    await aggregateIssues(pool).catch(captureError);
    await summarizeAndUpdateIssues(pool).catch(captureError);
  });

  // 교차검증: 15분 주기 (quiet hours 제외)
  cron.schedule('3,18,33,48 * * * *', async () => {
    if (isQuietHours()) return;
    await crossValidateIssues(pool).catch(captureError);
  });
  console.log('[scheduler] cross-validation: every 15 min (offset +3)');

  // 순위 스냅샷: 1시간 주기 (정시, quiet hours 제외)
  cron.schedule('0 * * * *', async () => {
    if (isQuietHours()) return;
    await snapshotRankings(pool).catch(captureError);
  });
  console.log('[scheduler] rank snapshot: hourly');

  // Apify SNS 수집: 09:00, 18:00 KST (= 00:00, 09:00 UTC)
  cron.schedule('0 0,9 * * *', () => {
    runApifyScrapers().catch(captureError);
  });
  console.log('[scheduler] apify SNS: 00:00, 09:00 UTC (09:00, 18:00 KST)');

  // 일일 DB 백업: 17:00 UTC = 02:00 KST (저트래픽 시간)
  cron.schedule('0 17 * * *', async () => {
    try {
      const result = await performDatabaseBackup();
      await notifyBackupResult(result);
    } catch (err) {
      captureError(err);
    }
  });
  console.log('[scheduler] backup: 17:00 UTC daily (02:00 KST)');

  // 자정 + 정오 2회 (Railway 서버 = UTC 기준) — DB 한도 대응
  cron.schedule('0 0,12 * * *', async () => {
    try {
      await cleanOldPosts();
      await cleanNumericTitlePosts();
      await cleanOldScraperRuns();
      await cleanOldEngagementSnapshots();
      await cleanExpiredTrendKeywords(pool);
      await cleanExpiredIssueRankings(pool);
      await checkDbSize(pool);
    } catch (err) {
      captureError(err);
    }
  });
}
