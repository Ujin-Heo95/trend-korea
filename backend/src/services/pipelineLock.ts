/**
 * pipelineLock — 프로세스 내 in-memory mutex 기반 cron tick 직렬화.
 *
 * 목적:
 *   파이프라인 tick 이 길어져 다음 tick 과 겹치는 상황을 원천 차단.
 *   다음 tick 은 `skipped` 로그만 남기고 즉시 종료.
 *
 * 변경 이력(2026-04-12):
 *   pg_try_advisory_lock(session-level) 사용 → in-memory Map 으로 전환.
 *   배경: Supabase Supavisor(transaction-mode pooler, :6543) 와 session-level
 *         advisory lock 은 근본적으로 호환 불가. Supavisor 가 underlying
 *         Postgres backend 를 풀에서 재사용하면서 lock 보유 session 이
 *         worker 외부에 stuck 됨 → unlock_all 로도 풀 수 없음 → 무한 skip.
 *         실제 11:00, 11:10 두 번 연속 skipped=2 로 확인.
 *   현 운영: worker 프로세스 1대 (fly.toml worker process group, count=1)
 *         이므로 DB-레벨 분산 락이 불필요. process-local Map 으로 충분.
 *   확장 시: worker 를 다대로 늘릴 일이 생기면 leases 테이블(timestamp +
 *         expiry) 패턴으로 다시 전환. advisory lock 으로는 절대 회귀하지 말 것.
 *
 * pool 파라미터는 호환성을 위해 유지하지만 사용하지 않는다.
 */
import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export const PIPELINE_LOCK_KEYS = {
  issuePipeline: 0xa001,
  summarizer: 0xa002,
  trackBDecay: 0xa003,
  crossValidation: 0xa004,
} as const;

export type PipelineLockKey = (typeof PIPELINE_LOCK_KEYS)[keyof typeof PIPELINE_LOCK_KEYS];

let lockSkippedCount = 0;
export function getLockSkippedCount(): number {
  return lockSkippedCount;
}
export function resetLockSkippedCount(): void {
  lockSkippedCount = 0;
}

const inFlight = new Set<PipelineLockKey>();

export async function withPipelineLock<T>(
  _pool: Pool,
  lockKey: PipelineLockKey,
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (process.env.PIPELINE_LOCK_ENABLED === 'false') {
    return await fn();
  }
  if (inFlight.has(lockKey)) {
    lockSkippedCount++;
    logger.warn(
      { lockKey: `0x${lockKey.toString(16)}`, label, skipped: lockSkippedCount },
      '[pipelineLock] previous tick still running — skipping',
    );
    return null;
  }
  inFlight.add(lockKey);
  try {
    return await fn();
  } finally {
    inFlight.delete(lockKey);
  }
}
