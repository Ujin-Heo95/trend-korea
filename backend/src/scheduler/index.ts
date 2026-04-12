import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { runAllScrapers, runScrapersByPriority, runApifyScrapers } from '../scrapers/index.js';
import { loadCircuitStates } from '../scrapers/base.js';
import { cleanOldPosts, cleanOldScraperRuns, cleanOldEngagementSnapshots, cleanNumericTitlePosts } from '../db/cleanup.js';
import { calculateScores } from '../services/scoring.js';
import { cleanExpiredTrendKeywords } from '../services/trendSignals.js';
import { aggregateIssues, snapshotRankings, cleanExpiredIssueRankings, materializeIssueResponse } from '../services/issueAggregator.js';
import { summarizeAndUpdateIssues } from '../services/geminiSummarizer.js';
import { crossValidateIssues } from '../services/crossValidator.js';
import { checkDbSize } from '../services/dbMonitor.js';
import { clearIssuesCache } from '../routes/issues.js';
import { performDatabaseBackup } from '../services/backup.js';
import { notifyBackupResult } from '../services/discord.js';
import { generateEmbeddingsForRecentPosts, loadEmbeddingsFromDb } from '../services/embedding.js';
import { batchPool, logPoolStats } from '../db/client.js';
import { runPipeline } from './pipeline.js';
import { loadFeatureFlags } from '../services/featureFlags.js';
import { enrichYoutubeEngagement } from '../services/youtubeEnrichment.js';
import { checkPipelineHealth } from '../services/pipelineHealth.js';
import { runTrackBDecay } from '../services/decayUpdater.js';

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

export function startScheduler(delayMs = 60_000): void {
  console.log(`[scheduler] priority intervals: high=${PRIORITY_INTERVALS.high}min, medium=${PRIORITY_INTERVALS.medium}min, low=${PRIORITY_INTERVALS.low}min`);
  console.log(`[scheduler] cleanup: twice daily (00:00, 12:00 UTC)`);
  console.log(`[scheduler] quiet hours: 02:00-06:00 KST (issue aggregation paused)`);

  // 배포 직후 DB 커넥션 경쟁 방지: 서버 listen 후 일정 시간 대기
  console.log(`[scheduler] waiting ${delayMs / 1000}s before initial scraper run...`);
  setTimeout(async () => {
    await loadCircuitStates(batchPool).catch(captureError);
    await loadEmbeddingsFromDb(batchPool).catch(captureError);
    runAllScrapers()
      .catch(captureError)
      .finally(() => {
        console.log('[scheduler] initial scraper run complete — starting cron jobs');
        startCronJobs();
      });
  }, delayMs);
}

function startCronJobs(): void {
  // 우선순위별 cron
  for (const [priority, minutes] of Object.entries(PRIORITY_INTERVALS)) {
    cron.schedule(`*/${minutes} * * * *`, () => {
      runScrapersByPriority(priority as keyof typeof PRIORITY_INTERVALS).catch(captureError);
    });
  }

  // 트렌드 스코어 갱신 + 이슈 집계: 정시 10분 주기 (:00, :10, :20, …)
  // TD-006: Gemini 요약은 이 파이프라인에서 분리 — 별도 +2 tick.
  cron.schedule('*/10 * * * *', async () => {
    if (isQuietHours()) {
      console.log('[scheduler] quiet hours (02-06 KST) — skipping issue pipeline');
      return;
    }
    logPoolStats('pipeline-start');
    try {
      const flags = await loadFeatureFlags();
      await runPipeline('issue-pipeline', [
        { name: 'calculateScores', run: () => calculateScores(batchPool), critical: true },
        ...(flags.embeddings_enabled
          ? [{ name: 'generateEmbeddings', run: () => generateEmbeddingsForRecentPosts(batchPool) }]
          : []),
        { name: 'aggregateIssues', run: () => aggregateIssues(batchPool), critical: true },
        { name: 'materializeResponse', run: () => materializeIssueResponse(batchPool) },
      ]);
      await checkPipelineHealth(batchPool).catch(captureError);
    } finally {
      clearIssuesCache();
      logPoolStats('pipeline-end');
    }
  });

  // TD-006: Gemini 요약 — 독립 tick (offset +2분)
  // aggregateIssues 실패/지연이 사용자 응답 경로(materialize)에 전파되지 않도록 분리.
  // summarizeAndUpdateIssues 내부에 phase 90s AbortController + fallback이 있어
  // 절대 전체 응답을 막지 않음.
  cron.schedule('2,12,22,32,42,52 * * * *', async () => {
    if (isQuietHours()) return;
    try {
      const flags = await loadFeatureFlags();
      if (!flags.gemini_summary_enabled) return;
      await summarizeAndUpdateIssues(batchPool);
      // 요약 결과 반영: materialized 재생성 + 응답 캐시 무효화
      await materializeIssueResponse(batchPool).catch(captureError);
      clearIssuesCache();
    } catch (err) {
      captureError(err);
    }
  });
  console.log('[scheduler] gemini summary: every 10 min (offset +2, flag-gated)');

  // Track B decay-only updater: 10분 주기 (offset +7 — legacy pipeline :00 과 분리)
  // feature flag OFF 기본. staging A/B 검증 후 ON.
  cron.schedule('7,17,27,37,47,57 * * * *', async () => {
    if (isQuietHours()) return;
    try {
      const flags = await loadFeatureFlags();
      if (!flags.scoring_track_b_enabled) return;
      await runTrackBDecay(batchPool);
    } catch (err) {
      captureError(err);
    }
  });
  console.log('[scheduler] track B decay: every 10 min (offset +7, flag-gated)');

  // 교차검증: 15분 주기 (quiet hours 제외)
  cron.schedule('3,18,33,48 * * * *', async () => {
    if (isQuietHours()) return;
    const flags = await loadFeatureFlags();
    if (!flags.cross_validation_enabled) return;
    await crossValidateIssues(batchPool).catch(captureError);
  });
  console.log('[scheduler] cross-validation: every 15 min (offset +3)');

  // 순위 스냅샷: 1시간 주기 (정시, quiet hours 제외)
  cron.schedule('0 * * * *', async () => {
    if (isQuietHours()) return;
    await snapshotRankings(batchPool).catch(captureError);
  });
  console.log('[scheduler] rank snapshot: hourly');

  // YouTube 영상 통계 보강: 30분 주기 (offset +5)
  cron.schedule('5,35 * * * *', async () => {
    await enrichYoutubeEngagement(batchPool).catch(captureError);
  });
  console.log('[scheduler] youtube enrichment: every 30 min (offset +5)');

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

  // 02:00 + 14:00 KST = 17:00, 05:00 UTC (피크 시간 회피) — DB 한도 대응
  cron.schedule('0 17,5 * * *', async () => {
    try {
      await cleanOldPosts();
      await cleanNumericTitlePosts();
      await cleanOldScraperRuns();
      await cleanOldEngagementSnapshots();
      await cleanExpiredTrendKeywords(batchPool);
      await cleanExpiredIssueRankings(batchPool);
      await checkDbSize(batchPool);
    } catch (err) {
      captureError(err);
    }
  });
}
