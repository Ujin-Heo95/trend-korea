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
  } finally {
    if (!acquired) client.release();
  }

  try {
    return await fn();
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    } catch (err) {
      logger.warn({ err, label }, '[pipelineLock] unlock failed');
    }
    client.release();
  }
}
