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
import { runKeywordIdfBatch, getKeywordIdfCoverage, cleanStaleKeywordIdf } from '../services/keywordIdfBatch.js';
import { runQualityMetricsBatch, cleanStaleQualityMetrics, getLatestMetric } from '../services/qualityMetricsBatch.js';
import {
  runQualityJudgeBatch,
  aggregateJudgments,
  persistJudgeMetrics,
  formatJudgeReport,
} from '../services/qualityJudge.js';
import { notifyPipelineWarning, notifyQualityReport } from '../services/discord.js';

function captureError(err: unknown): void {
  console.error(err);
  Sentry.captureException(err);
}

// IDF coverage 저알람 추적 — 30분(3 tick) 연속 50% 미만일 때만 Discord 알림.
let lowIdfCoverageStreak = 0;
let lastIdfCoverageAlertAt = 0;
async function monitorIdfCoverage(): Promise<void> {
  try {
    const coverage = await getKeywordIdfCoverage(batchPool);
    if (coverage < 0.5) {
      lowIdfCoverageStreak++;
    } else {
      lowIdfCoverageStreak = 0;
    }
    if (lowIdfCoverageStreak >= 3 && Date.now() - lastIdfCoverageAlertAt > 60 * 60 * 1000) {
      lastIdfCoverageAlertAt = Date.now();
      const pct = (coverage * 100).toFixed(1);
      await notifyPipelineWarning(
        'keyword_idf',
        `IDF 캐시 커버리지 ${pct}% (3 tick 연속 < 50%) — 배치 실패 가능`,
      );
    }
  } catch (err) {
    captureError(err);
  }
}

// 품질 메트릭 알림 — Stage 1 폐쇄 루프
//  - cluster.size_over_50_count > 0 → 즉시 (1h cooldown) — 과병합 폭주
//  - issue.score_nan_count > 0 → 즉시 — production NaN 누출
//  - keyword_idf.df0_ratio > 0.7 (5 tick 연속) → wiki phantom 오염
//  - issue.merge_pairs_total / cluster 신호가 모두 0인 경우 (3 tick 연속) → 게이트 과엄격
const qualityAlertState = {
  clusterOver50LastAt: 0,
  scoreNanLastAt: 0,
  df0HighStreak: 0,
  df0LastAt: 0,
};
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

async function monitorQualityMetrics(): Promise<void> {
  try {
    const [over50, nanCount, df0Ratio] = await Promise.all([
      getLatestMetric(batchPool, 'cluster.size_over_50_count'),
      getLatestMetric(batchPool, 'issue.score_nan_count'),
      getLatestMetric(batchPool, 'keyword_idf.df0_ratio'),
    ]);
    const now = Date.now();

    if ((over50 ?? 0) > 0 && now - qualityAlertState.clusterOver50LastAt > ALERT_COOLDOWN_MS) {
      qualityAlertState.clusterOver50LastAt = now;
      await notifyPipelineWarning('quality.cluster_overmerge', `cluster.size_over_50_count = ${over50} — 과병합 클러스터 발생`);
    }

    if ((nanCount ?? 0) > 0 && now - qualityAlertState.scoreNanLastAt > ALERT_COOLDOWN_MS) {
      qualityAlertState.scoreNanLastAt = now;
      await notifyPipelineWarning('quality.score_nan', `issue.score_nan_count = ${nanCount} — production NaN 누출 (즉시 조사)`);
    }

    if ((df0Ratio ?? 0) > 0.7) {
      qualityAlertState.df0HighStreak++;
    } else {
      qualityAlertState.df0HighStreak = 0;
    }
    if (qualityAlertState.df0HighStreak >= 5 && now - qualityAlertState.df0LastAt > ALERT_COOLDOWN_MS) {
      qualityAlertState.df0LastAt = now;
      await notifyPipelineWarning(
        'quality.idf_df0',
        `keyword_idf.df0_ratio = ${(df0Ratio! * 100).toFixed(1)}% (5 tick 연속 >70%) — wiki phantom 오염 감지`,
      );
    }
  } catch (err) {
    captureError(err);
  }
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

  // 트렌드 스코어 갱신 + 이슈 집계: 정시 10분 주기 offset +4 (:04, :14, :24, …)
  // offset 이유: scraper cron(`*/10`,`*/15`,`*/30`)이 :00/:15/:30 에서 동시 발화 →
  //             batchPool 경합으로 calculateScores 108s Supabase 커넥션 드롭 → critical 실패.
  //             scraper-high 가 :00 에 시작해 ~2-3분 걸리므로 :04 에 시작하면 여유 확보.
  // TD-006: Gemini 요약은 이 파이프라인에서 분리 — 별도 +2 offset (현 설정: 2,12,22,...).
  cron.schedule('4,14,24,34,44,54 * * * *', async () => {
    if (isQuietHours()) {
      console.log('[scheduler] quiet hours (02-06 KST) — skipping issue pipeline');
      return;
    }
    logPoolStats('pipeline-start');
    try {
      const flags = await loadFeatureFlags();
      await runPipeline('issue-pipeline', [
        // 비 critical 전환: 일시적 Supabase 커넥션 드롭 시에도 후속 단계(aggregateIssues)는
        // 직전 tick 의 post_scores 로 진행 → issue_rankings 신규 카드 생성이 멈추지 않음.
        { name: 'calculateScores', run: () => calculateScores(batchPool), critical: false },
        ...(flags.embeddings_enabled
          ? [{ name: 'generateEmbeddings', run: () => generateEmbeddingsForRecentPosts(batchPool) }]
          : []),
        { name: 'aggregateIssues', run: () => aggregateIssues(batchPool), critical: true },
        { name: 'materializeResponse', run: () => materializeIssueResponse(batchPool) },
        { name: 'keywordIdfBatch', run: () => runKeywordIdfBatch(batchPool) },
        { name: 'qualityMetricsBatch', run: () => runQualityMetricsBatch(batchPool) },
      ]);
      await monitorIdfCoverage();
      await monitorQualityMetrics();
      await checkPipelineHealth(batchPool).catch(captureError);
    } finally {
      clearIssuesCache();
      logPoolStats('pipeline-end');
    }
  });

  // TD-006: Gemini 요약 — 독립 tick
  // 파이프라인(:04,:14,...) 완료 후 5분 여유 두고 실행 (:09,:19,...) — issue_rankings 최신 상태 보장.
  // aggregateIssues 실패/지연이 사용자 응답 경로(materialize)에 전파되지 않도록 분리.
  // summarizeAndUpdateIssues 내부에 phase 90s AbortController + fallback이 있어
  // 절대 전체 응답을 막지 않음.
  cron.schedule('9,19,29,39,49,59 * * * *', async () => {
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
  console.log('[scheduler] gemini summary: every 10 min (offset +9, flag-gated)');

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

  // 품질 플라이휠 Stage 2 — LLM judge: 02:00 KST 평가 → 02:30 KST Discord 리포트
  // KST 02:00 = UTC 17:00 / KST 02:30 = UTC 17:30. quiet hours 한가운데라 트래픽 0.
  // 평가 결과를 모듈 스코프로 들고 30분 후 같은 프로세스에서 리포트하도록 캐시.
  let lastJudgeReport: { at: number; report: string } | null = null;
  cron.schedule('0 17 * * *', async () => {
    try {
      const flags = await loadFeatureFlags();
      if (!flags.gemini_summary_enabled) {
        console.log('[scheduler] qualityJudge skipped — gemini disabled');
        return;
      }
      const batchResult = await runQualityJudgeBatch(batchPool);
      const aggregate = aggregateJudgments(batchResult.results);
      await persistJudgeMetrics(batchPool, aggregate).catch(captureError);
      lastJudgeReport = {
        at: Date.now(),
        report: formatJudgeReport({ batchResult, aggregate }),
      };
    } catch (err) {
      captureError(err);
    }
  });
  console.log('[scheduler] quality judge: 17:00 UTC daily (02:00 KST)');

  cron.schedule('30 17 * * *', async () => {
    try {
      if (!lastJudgeReport || Date.now() - lastJudgeReport.at > 60 * 60 * 1000) {
        await notifyQualityReport('품질 리포트: 평가 결과 없음 (judge 미실행 또는 실패)');
        return;
      }
      await notifyQualityReport(lastJudgeReport.report);
    } catch (err) {
      captureError(err);
    }
  });
  console.log('[scheduler] quality report: 17:30 UTC daily (02:30 KST)');

  // 02:00 + 14:00 KST = 17:00, 05:00 UTC (피크 시간 회피) — DB 한도 대응
  cron.schedule('0 17,5 * * *', async () => {
    try {
      await cleanOldPosts();
      await cleanNumericTitlePosts();
      await cleanOldScraperRuns();
      await cleanOldEngagementSnapshots();
      await cleanExpiredTrendKeywords(batchPool);
      await cleanExpiredIssueRankings(batchPool);
      await cleanStaleKeywordIdf(batchPool);
      await cleanStaleQualityMetrics(batchPool);
      await checkDbSize(batchPool);
    } catch (err) {
      captureError(err);
    }
  });
}
