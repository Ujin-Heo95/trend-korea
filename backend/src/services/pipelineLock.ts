/**
 * pipelineLock — Postgres advisory lock 기반 cron tick 직렬화.
 *
 * 목적:
 *   - `:04` 이슈 파이프라인이 5분을 초과해 다음 `:09/:14` tick과 겹치는
 *     상황을 원천 차단. 다음 tick은 `skipped` 로그만 남기고 즉시 종료.
 *   - Fly.io 수평 확장 시에도 안전 (advisory lock은 DB 레벨 전역).
 *
 * 사용:
 *   await withPipelineLock(batchPool, PIPELINE_LOCK_KEYS.issuePipeline, async () => {
 *     await runPipeline(...)
 *   });
 */
import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export const PIPELINE_LOCK_KEYS = {
  issuePipeline: 0xa001,
  summarizer: 0xa002,
  trackBDecay: 0xa003,
  crossValidation: 0xa004,
  mergeArbiter: 0xa005,
} as const;

export type PipelineLockKey = (typeof PIPELINE_LOCK_KEYS)[keyof typeof PIPELINE_LOCK_KEYS];

let lockSkippedCount = 0;
export function getLockSkippedCount(): number {
  return lockSkippedCount;
}
export function resetLockSkippedCount(): void {
  lockSkippedCount = 0;
}

/**
 * advisory lock을 시도 획득하고 콜백을 실행한다.
 * 이미 다른 프로세스/이전 tick이 보유 중이면 즉시 null 반환.
 *
 * 구현 노트(2026-04-12 핫픽스):
 *   체크아웃 시 pg_advisory_unlock_all() 로 *이 connection 에 남아있는 모든
 *   stale 락* 을 선제 정리한 뒤 새 락을 시도 획득.
 *   배경: session-level advisory lock 은 connection 단위로 유지되므로,
 *         worker 크래시/이전 fn 예외로 unlock 이 실패한 채 release 되면
 *         그 connection 이 평생 락을 쥔 채 풀에 남는다 (특히 min:2 프리웜).
 *         이후 모든 tick 이 같은 connection 을 받으면 무한 "skipping".
 *         unlock_all 은 같은 session 의 모든 advisory lock 만 해제하므로
 *         다른 connection/프로세스 의 락엔 영향 없어 안전.
 *   tx-bound 락(pg_try_advisory_xact_lock) 도 고려했으나 fn 실행 시간 동안
 *         connection 이 idle-in-transaction 상태가 되어 Supabase
 *         idle_in_transaction_session_timeout 위험.
 */
export async function withPipelineLock<T>(
  pool: Pool,
  lockKey: PipelineLockKey,
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (process.env.PIPELINE_LOCK_ENABLED === 'false') {
    return await fn();
  }
  const client = await pool.connect();
  let acquired = false;
  try {
    // 선제 정리: 이 connection 에 잔존할 수 있는 모든 stale 락 해제.
    await client.query('SELECT pg_advisory_unlock_all()').catch((err) => {
      logger.warn({ err, label }, '[pipelineLock] preemptive unlock_all failed');
    });

    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [lockKey],
    );
    acquired = rows[0]?.locked === true;
    if (!acquired) {
      lockSkippedCount++;
      logger.warn(
        { lockKey: `0x${lockKey.toString(16)}`, label, skipped: lockSkippedCount },
        '[pipelineLock] previous tick still running — skipping',
      );
      return null;
    }

    return await fn();
  } finally {
    if (acquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      } catch (err) {
        logger.warn({ err, label }, '[pipelineLock] unlock failed');
      }
    }
    client.release();
  }
}
