/**
 * watchdog — L1 자동 회복 + L2 synthetic probe.
 *
 * 목적: "조용히 실패" 를 기계가 먼저 잡는다. 지난 2시간의 아키텍처 사고들이
 *   알려준 교훈:
 *     - /health 200 + tsc OK + unit test 통과 여도 사용자 화면은 stale 할 수 있음
 *     - 사용자가 수기로 /api/issues 를 curl 해서 발견할 때까지 방치되는 경로가 너무 많음
 *   이 파일은 그 간극을 채운다.
 *
 * L1 — stale watchdog (2분 주기):
 *   MAX(calculated_at) > 15분 경과면 강제 집계 재실행.
 *   일반 cron 과 pipelineLock 공유 — 정상 tick 과 충돌하지 않음.
 *
 * L2 — synthetic probe (3분 주기):
 *   사용자가 보는 쿼리와 동일한 criteria 로 DB 에서 직접 검증:
 *     (a) data age < 300 초
 *     (b) window=12h 이슈 카드 ≥ 5 개
 *     (c) 정규화 제목 중복 0 건
 *     (d) fallback summary 비율 < 50%
 *   1개라도 실패하면 L1 watchdog 을 즉시 트리거.
 *
 * 관측성: 마지막 성공 시각 / 마지막 실패 reason 을 모듈 state 로 보관 —
 *   /health 엔드포인트가 노출해 외부 모니터링이 pull 할 수 있다.
 *
 * 실패 쿨다운: Discord 알림은 30분 쿨다운. 같은 이유 반복 알림 방지.
 */
import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { notifyPipelineWarning } from '../services/discord.js';
import { aggregateIssues, materializeIssueResponse } from '../services/issueAggregator.js';
import { clearIssuesCache } from '../routes/issues.js';
import { withPipelineLock, PIPELINE_LOCK_KEYS } from '../services/pipelineLock.js';

// ─── 모듈 state (관측성) ───

interface WatchdogStatus {
  last_check_at: string | null;
  last_recovery_at: string | null;
  last_probe_ok_at: string | null;
  last_probe_failure: string | null;
  recovery_count_24h: number;
  probe_failure_count_24h: number;
}

const status: WatchdogStatus = {
  last_check_at: null,
  last_recovery_at: null,
  last_probe_ok_at: null,
  last_probe_failure: null,
  recovery_count_24h: 0,
  probe_failure_count_24h: 0,
};

export function getWatchdogStatus(): Readonly<WatchdogStatus> {
  return { ...status };
}

// ─── 상수 ───

const STALE_THRESHOLD_SEC = 15 * 60;        // 15분 이상 stale 이면 강제 재집계
const PROBE_AGE_MAX_SEC = 300;              // probe: age < 5분
const PROBE_MIN_ISSUES = 5;                 // probe: 최소 이슈 수
const PROBE_FALLBACK_RATIO_MAX = 0.5;       // probe: fallback 비율 < 50%
const PROBE_WINDOW = 12;                    // probe 기준 창
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;   // 같은 알림 30분 쿨다운

let lastAlertAt = 0;
let lastAlertReason: string | null = null;

async function maybeAlert(reason: string, detail: string): Promise<void> {
  const now = Date.now();
  if (reason === lastAlertReason && now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;
  lastAlertReason = reason;
  await notifyPipelineWarning(`watchdog:${reason}`, detail).catch(() => {});
}

// ─── L1: stale watchdog ───

/** MAX(calculated_at) 을 DB 에서 직접 확인. stale 이면 강제 복구. */
export async function runIssueWatchdog(pool: Pool): Promise<'ok' | 'stale' | 'recovered' | 'failed'> {
  status.last_check_at = new Date().toISOString();
  try {
    const { rows } = await pool.query<{ age_sec: number | null }>(
      `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(calculated_at)))::int AS age_sec
         FROM issue_rankings WHERE expires_at > NOW()`,
    );
    const ageSec = rows[0]?.age_sec ?? null;
    if (ageSec === null) {
      await maybeAlert('no_data', 'issue_rankings 테이블이 비어있음 (expires_at < NOW 포함). 즉시 재집계 시도');
      return await forceRecovery(pool, 'no_data');
    }
    if (ageSec > STALE_THRESHOLD_SEC) {
      logger.warn({ ageSec }, '[watchdog] stale detected, forcing recovery');
      return await forceRecovery(pool, `stale_${ageSec}s`);
    }
    return 'ok';
  } catch (err) {
    logger.error({ err }, '[watchdog] check failed');
    await maybeAlert('check_error', `watchdog DB query failed: ${err instanceof Error ? err.message : String(err)}`);
    return 'failed';
  }
}

async function forceRecovery(pool: Pool, reason: string): Promise<'recovered' | 'failed'> {
  const result = await withPipelineLock(pool, PIPELINE_LOCK_KEYS.issuePipeline, 'watchdog-recovery', async () => {
    try {
      logger.warn({ reason }, '[watchdog] forcing aggregateIssues + materialize');
      await aggregateIssues(pool);
      await materializeIssueResponse(pool);
      clearIssuesCache(`watchdog-recovery:${reason}`);
      status.last_recovery_at = new Date().toISOString();
      status.recovery_count_24h++;
      logger.info({ reason }, '[watchdog] recovery complete');
      await maybeAlert('recovered', `자동 복구 성공 (reason=${reason})`);
      return 'recovered' as const;
    } catch (err) {
      logger.error({ err, reason }, '[watchdog] recovery failed');
      await maybeAlert('recovery_error', `자동 복구 실패 (reason=${reason}): ${err instanceof Error ? err.message : String(err)}`);
      return 'failed' as const;
    }
  }).catch(() => 'failed' as const);
  // pipelineLock 이 이미 잡혀있어 skipped 된 경우 (null) → stale 지속 → failed 로 보고
  return result ?? 'failed';
}

// ─── L2: synthetic probe ───

interface ProbeResult {
  ok: boolean;
  age_sec: number | null;
  issue_count: number;
  duplicate_title_count: number;
  fallback_ratio: number;
  reasons: readonly string[];
}

/** 사용자가 보는 쿼리와 동등한 검사. 실패 시 L1 트리거. */
export async function runIssueProbe(pool: Pool): Promise<ProbeResult> {
  const reasons: string[] = [];
  try {
    const { rows: issues } = await pool.query<{
      title: string;
      summary: string | null;
      calculated_at: string;
    }>(
      `SELECT title, summary, calculated_at::text
         FROM issue_rankings
        WHERE expires_at > NOW() AND window_hours = $1
        ORDER BY issue_score DESC
        LIMIT 15`,
      [PROBE_WINDOW],
    );

    // (a) data age
    let ageSec: number | null = null;
    if (issues.length > 0) {
      ageSec = Math.max(
        0,
        Math.round((Date.now() - new Date(issues[0].calculated_at).getTime()) / 1000),
      );
      if (ageSec > PROBE_AGE_MAX_SEC) reasons.push(`age=${ageSec}s>${PROBE_AGE_MAX_SEC}`);
    }

    // (b) min count
    if (issues.length < PROBE_MIN_ISSUES) reasons.push(`count=${issues.length}<${PROBE_MIN_ISSUES}`);

    // (c) duplicate normalized titles
    const normalize = (t: string): string =>
      t.toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/[\s\p{P}\p{S}]+/gu, '').trim();
    const titleCounts = new Map<string, number>();
    for (const i of issues) {
      const nt = normalize(i.title);
      if (nt.length < 8) continue;
      titleCounts.set(nt, (titleCounts.get(nt) ?? 0) + 1);
    }
    const dupCount = [...titleCounts.values()].filter(c => c > 1).length;
    if (dupCount > 0) reasons.push(`duplicate_titles=${dupCount}`);

    // (d) fallback ratio
    const fallback = issues.filter(i =>
      i.summary === null || i.summary.startsWith('[fallback]'),
    ).length;
    const ratio = issues.length > 0 ? fallback / issues.length : 0;
    if (ratio > PROBE_FALLBACK_RATIO_MAX) reasons.push(`fallback_ratio=${ratio.toFixed(2)}>${PROBE_FALLBACK_RATIO_MAX}`);

    const result: ProbeResult = {
      ok: reasons.length === 0,
      age_sec: ageSec,
      issue_count: issues.length,
      duplicate_title_count: dupCount,
      fallback_ratio: ratio,
      reasons,
    };

    if (result.ok) {
      status.last_probe_ok_at = new Date().toISOString();
      return result;
    }

    // 실패 경로
    status.last_probe_failure = `${new Date().toISOString()} — ${reasons.join(',')}`;
    status.probe_failure_count_24h++;
    logger.warn({ result }, '[probe] synthetic probe failed — triggering watchdog');
    await maybeAlert('probe_failed', `probe 실패: ${reasons.join(', ')}`);
    // L1 트리거
    await runIssueWatchdog(pool).catch(err => logger.error({ err }, '[probe] watchdog trigger failed'));
    return result;
  } catch (err) {
    logger.error({ err }, '[probe] query failed');
    status.last_probe_failure = `${new Date().toISOString()} — query_error:${err instanceof Error ? err.message : String(err)}`;
    status.probe_failure_count_24h++;
    await maybeAlert('probe_query_error', `probe 쿼리 실패: ${err instanceof Error ? err.message : String(err)}`);
    return {
      ok: false,
      age_sec: null,
      issue_count: 0,
      duplicate_title_count: 0,
      fallback_ratio: 0,
      reasons: ['query_error'],
    };
  }
}

// ─── 24h 카운터 리셋 (매일 00:00 KST) ───

export function resetDailyCounters(): void {
  status.recovery_count_24h = 0;
  status.probe_failure_count_24h = 0;
}

// ─── Web-process watchdog bootstrap ───
//
// 배경: worker 프로세스가 fly deploy 중 stopped 상태로 남는 사고 (2026-04-12 22:21~).
//   auto_start_machines=true 는 [http_service] 블록(=web) 에만 적용되고 worker 는
//   자동 재기동 보장 없음. worker 가 죽으면 cron 전체가 정지 → 사용자 영구 stale.
//
// 해결: watchdog + probe 를 web 프로세스에서도 독립적으로 기동.
//   - web 은 min_machines_running=1 로 보장 → 절대 죽지 않음
//   - pipelineLock 공유 → worker 가 살아있어도 중복 실행되지 않음
//   - worker 가 죽으면 web 쪽 watchdog 이 자동으로 aggregate+materialize 수행
//
// 전체 scheduler 를 web 에서 돌리면 스크래퍼까지 중복 → 이 함수는 watchdog+probe 만 등록.
import cron from 'node-cron';
import { batchPool } from '../db/client.js';

let webWatchdogStarted = false;

export function startWebWatchdog(): void {
  if (webWatchdogStarted) return;
  webWatchdogStarted = true;

  // L1 — stale watchdog: 2분 주기
  cron.schedule('*/2 * * * *', () => {
    void runIssueWatchdog(batchPool).catch(err => logger.error({ err }, '[web-watchdog] L1 error'));
  });
  // L2 — synthetic probe: 3분 주기
  cron.schedule('*/3 * * * *', () => {
    void runIssueProbe(batchPool).catch(err => logger.error({ err }, '[web-watchdog] L2 error'));
  });
  // 부팅 직후 즉시 1회 실행 — 다음 cron tick 까지 대기하지 않음.
  // 사용자가 "인지 못하는 채로 죽어있어" 사고를 겪은 직접 원인. 배포 직후 5초 안에 회복 시도.
  setTimeout(() => {
    void runIssueWatchdog(batchPool).catch(err => logger.error({ err }, '[web-watchdog] initial check error'));
  }, 5_000);

  logger.info('[web-watchdog] started — L1 every 2min, L2 every 3min, initial check in 5s');
}
