import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { runScrapersByPriority } from '../scrapers/index.js';
import { loadCircuitStates } from '../scrapers/base.js';
import { cleanOldPosts, cleanOldScraperRuns, cleanOldEngagementSnapshots, cleanNumericTitlePosts } from '../db/cleanup.js';
import { calculateScores } from '../services/scoring.js';
import { cleanExpiredTrendKeywords } from '../services/trendSignals.js';
import { aggregateIssues, snapshotRankings, cleanExpiredIssueRankings, materializeIssueResponse } from '../services/issueAggregator.js';
import { runV8Pipeline } from '../services/v8/pipeline.js';
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
import { runMergeArbiterWorker } from '../services/mergeArbiterWorker.js';
import { withPipelineLock, PIPELINE_LOCK_KEYS } from '../services/pipelineLock.js';
import { runIssueWatchdog, runIssueProbe, resetDailyCounters } from './watchdog.js';
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

// 부팅 시 분산 발화 스케줄 (초 단위, listen 직후 기준)
// 의도: 단일 T+60s 폭발 → 4분에 걸친 우선순위별 stagger 로 변경.
// shared-cpu-1x 에서 78개 TLS 핸드셰이크 동시 발화로 인한 이벤트 루프 freeze 차단.
const BOOT_STAGGER = {
  cronRegister:    15_000,   // T+15s : cron 등록 먼저 (분 경계 미스 방지)
  circuitStates:   30_000,   // T+30s : 서킷 브레이커 상태 로드 (가벼움)
  highPriority:    45_000,   // T+45s : ~12 소스
  mediumPriority: 150_000,   // T+2:30 : ~30 소스
  lowPriority:    270_000,   // T+4:30 : ~36 소스
  embeddings:     330_000,   // T+5:30 : 무거우니 마지막
} as const;

export function startScheduler(): void {
  console.log(`[scheduler] priority intervals: high=${PRIORITY_INTERVALS.high}min, medium=${PRIORITY_INTERVALS.medium}min, low=${PRIORITY_INTERVALS.low}min`);
  console.log(`[scheduler] cleanup: twice daily (00:00, 12:00 UTC)`);
  console.log(`[scheduler] quiet hours: 02:00-06:00 KST (issue aggregation paused)`);

  const skipInitial = process.env.SKIP_INITIAL_SCRAPE === 'true';
  if (skipInitial) {
    console.log('[scheduler] SKIP_INITIAL_SCRAPE=true — boot 시 스크래퍼 발화 생략, cron 에 일임');
  }

  // T+15s : cron 등록 (등록은 즉시여도 무방하나 부팅 직후 부하 최소화 위해 살짝 지연)
  setTimeout(() => {
    startCronJobs();
    console.log('[scheduler] cron jobs registered');
  }, BOOT_STAGGER.cronRegister);

  // T+30s : 서킷 브레이커 상태 로드 — 단일 SELECT
  setTimeout(() => {
    loadCircuitStates(batchPool).catch(captureError);
  }, BOOT_STAGGER.circuitStates);

  if (!skipInitial) {
    // T+45s : high priority 만 (커뮤니티/트렌딩 ~12개)
    setTimeout(() => {
      console.log('[scheduler] boot stagger: high-priority scrapers');
      runScrapersByPriority('high').catch(captureError);
    }, BOOT_STAGGER.highPriority);

    // T+2:30 : medium priority (뉴스 RSS ~30개)
    setTimeout(() => {
      console.log('[scheduler] boot stagger: medium-priority scrapers');
      runScrapersByPriority('medium').catch(captureError);
    }, BOOT_STAGGER.mediumPriority);

    // T+4:30 : low priority (정부/기상청 ~36개)
    setTimeout(() => {
      console.log('[scheduler] boot stagger: low-priority scrapers');
      runScrapersByPriority('low').catch(captureError);
    }, BOOT_STAGGER.lowPriority);
  }

  // T+5:30 : 임베딩 로드 — 메모리/DB 무겁기 때문에 모든 스크래퍼 burst 이후로 미룸
  setTimeout(() => {
    loadEmbeddingsFromDb(batchPool).catch(captureError);
  }, BOOT_STAGGER.embeddings);
}

function startCronJobs(): void {
  // 우선순위별 cron
  for (const [priority, minutes] of Object.entries(PRIORITY_INTERVALS)) {
    cron.schedule(`*/${minutes} * * * *`, () => {
      runScrapersByPriority(priority as keyof typeof PRIORITY_INTERVALS).catch(captureError);
    });
  }

  // 트렌드 스코어 갱신 + 이슈 집계: 정시 10분 주기 (:00, :10, :20, …)
  // worker 프로세스 분리(2026-04-12) 이후 web 트래픽과 컴퓨트 격리되어 정시 정렬 가능.
  // scraper high cron(:00) 과 동시 발화하지만 batchPool=15, scoring p-limit(4) +
  // scraper p-limit(4) = 최대 8 동시 → batchPool 여유 안에서 안전.
  // 사용자 요구: 종합 탭 갱신 시각이 :00/:10/:20 등 round timestamp 로 보이도록.
  cron.schedule('0,10,20,30,40,50 * * * *', async () => {
    if (isQuietHours()) {
      console.log('[scheduler] quiet hours (02-06 KST) — skipping issue pipeline');
      return;
    }
    // advisory lock으로 tick 중첩 방지: 이전 :00 tick이 길어져 :10와 겹치면
    // :10는 즉시 skipped 로 종료 → 커넥션 풀 경합이 원천 차단된다.
    await withPipelineLock(batchPool, PIPELINE_LOCK_KEYS.issuePipeline, 'issue-pipeline', async () => {
      logPoolStats('pipeline-start');
      try {
        const flags = await loadFeatureFlags();
        if (flags.scoring_v8_enabled) {
          // v8 통합 파이프라인: loadPosts → embed → cluster → echo → score → rank → persist
          // 기존 calculateScores/aggregateIssues/keywordIdfBatch 체인을 단일 runV8Pipeline 으로 대체.
          await runPipeline('issue-pipeline-v8', [
            { name: 'runV8Pipeline', run: () => runV8Pipeline(batchPool), critical: true },
            { name: 'materializeResponse', run: () => materializeIssueResponse(batchPool) },
            { name: 'qualityMetricsBatch', run: () => runQualityMetricsBatch(batchPool) },
          ]);
        } else {
          await runPipeline('issue-pipeline', [
            { name: 'calculateScores', run: () => calculateScores(batchPool), critical: false },
            ...(flags.embeddings_enabled
              ? [{ name: 'generateEmbeddings', run: () => generateEmbeddingsForRecentPosts(batchPool) }]
              : []),
            { name: 'aggregateIssues', run: () => aggregateIssues(batchPool), critical: true },
            { name: 'materializeResponse', run: () => materializeIssueResponse(batchPool) },
            { name: 'keywordIdfBatch', run: () => runKeywordIdfBatch(batchPool) },
            { name: 'qualityMetricsBatch', run: () => runQualityMetricsBatch(batchPool) },
          ]);
        }
        await monitorIdfCoverage();
        await monitorQualityMetrics();
        await checkPipelineHealth(batchPool).catch(captureError);
      } finally {
        clearIssuesCache('pipeline-tick-complete');
        logPoolStats('pipeline-end');
      }
    }).catch(captureError);
  });

  // mergeArbiterWorker — 비동기 Gemini 중재자.
  // issue-pipeline(:00,:10,...) 과 2분 offset(:02,:12,...) 으로 pending_merge_decisions 큐 소비.
  // critical path에서 Gemini를 완전 제거한 뒤, 다음 파이프라인 tick이 결정을 재사용.
  cron.schedule('2,12,22,32,42,52 * * * *', async () => {
    if (isQuietHours()) return;
    await withPipelineLock(batchPool, PIPELINE_LOCK_KEYS.mergeArbiter, 'merge-arbiter', async () => {
      try {
        const flags = await loadFeatureFlags();
        if (!flags.gemini_summary_enabled) return; // gemini 자체가 꺼져있으면 skip
        await runMergeArbiterWorker(batchPool);
      } catch (err) {
        captureError(err);
      }
    }).catch(captureError);
  });
  console.log('[scheduler] merge arbiter worker: every 10 min (offset +2)');

  // TD-006: Gemini 요약 — 독립 tick
  // 파이프라인(:00,:10,...) 완료 후 5분 여유 두고 실행 (:05,:15,...) — issue_rankings 최신 상태 보장.
  // aggregateIssues 실패/지연이 사용자 응답 경로(materialize)에 전파되지 않도록 분리.
  // summarizeAndUpdateIssues 내부에 phase 90s AbortController + fallback이 있어
  // 절대 전체 응답을 막지 않음.
  cron.schedule('5,15,25,35,45,55 * * * *', async () => {
    if (isQuietHours()) return;
    await withPipelineLock(batchPool, PIPELINE_LOCK_KEYS.summarizer, 'summarizer', async () => {
      try {
        const flags = await loadFeatureFlags();
        if (!flags.gemini_summary_enabled) return;
        await summarizeAndUpdateIssues(batchPool);
        // 요약 결과 반영: materialized 재생성 + 응답 캐시 무효화
        // materializeIssueResponse 실패는 silent 였지만, stale 사고 5번째 재발 후 알람으로 승격.
        await materializeIssueResponse(batchPool).catch((err) => {
          captureError(err);
          const msg = err instanceof Error ? err.message : String(err);
          notifyPipelineWarning('materializeResponse(summary-tick)', msg).catch(() => {});
        });
        clearIssuesCache('summary-tick-complete');
      } catch (err) {
        captureError(err);
      }
    }).catch(captureError);
  });
  console.log('[scheduler] gemini summary: every 10 min (offset +5, flag-gated)');

  // Track B decay-only updater: 10분 주기 (offset +3 — pipeline :00 후 3분, arbiter :02 후 1분)
  // feature flag OFF 기본. staging A/B 검증 후 ON.
  cron.schedule('3,13,23,33,43,53 * * * *', async () => {
    if (isQuietHours()) return;
    await withPipelineLock(batchPool, PIPELINE_LOCK_KEYS.trackBDecay, 'trackB-decay', async () => {
      try {
        const flags = await loadFeatureFlags();
        if (!flags.scoring_track_b_enabled) return;
        await runTrackBDecay(batchPool);
      } catch (err) {
        captureError(err);
      }
    }).catch(captureError);
  });
  console.log('[scheduler] track B decay: every 10 min (offset +3, flag-gated)');

  // 교차검증: 15분 주기 (quiet hours 제외)
  cron.schedule('3,18,33,48 * * * *', async () => {
    if (isQuietHours()) return;
    await withPipelineLock(batchPool, PIPELINE_LOCK_KEYS.crossValidation, 'cross-validation', async () => {
      const flags = await loadFeatureFlags();
      if (!flags.cross_validation_enabled) return;
      await crossValidateIssues(batchPool).catch(captureError);
    }).catch(captureError);
  });
  console.log('[scheduler] cross-validation: every 15 min (offset +3)');

  // 순위 스냅샷: 1시간 주기 (정시, quiet hours 제외)
  cron.schedule('0 * * * *', async () => {
    if (isQuietHours()) return;
    await snapshotRankings(batchPool).catch(captureError);
  });
  console.log('[scheduler] rank snapshot: hourly');

  // L1 — stale watchdog: 2분 주기 (quiet hours 제외)
  //   MAX(calculated_at) > 15분 경과면 즉시 aggregateIssues + materialize 강제 실행.
  //   지난 세션 사고들(TDZ, silent abort, cross-process clearCache 실패)처럼 정상
  //   cron 이 이유없이 멈추는 경우 자동 복구. pipelineLock 공유.
  cron.schedule('*/2 * * * *', async () => {
    if (isQuietHours()) return;
    await runIssueWatchdog(batchPool).catch(captureError);
  });
  console.log('[scheduler] L1 issue watchdog: every 2 min');

  // L2 — synthetic probe: 3분 주기 (quiet hours 제외)
  //   사용자 쿼리 기준 검사: age/count/duplicate/fallback ratio. 실패 시 L1 트리거.
  cron.schedule('*/3 * * * *', async () => {
    if (isQuietHours()) return;
    await runIssueProbe(batchPool).catch(captureError);
  });
  console.log('[scheduler] L2 synthetic probe: every 3 min');

  // 24h 카운터 리셋: 매일 00:00 UTC (09:00 KST)
  cron.schedule('0 0 * * *', () => {
    resetDailyCounters();
  });

  // YouTube 영상 통계 보강: 3시간 주기 (offset +5)
  //   2026-04-12: 30분 주기 → 3시간. Data API 일일 할당 10,000 단위 초과 사고 대응.
  //   48회/일 → 8회/일. 최신성 손실은 video 카테고리 engagement snapshot 한정 (소폭).
  cron.schedule('5 */3 * * *', async () => {
    await enrichYoutubeEngagement(batchPool).catch(captureError);
  });
  console.log('[scheduler] youtube enrichment: every 3 hours (offset +5)');

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
