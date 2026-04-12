/**
 * pendingMergeDecisions — issueAggregator ↔ mergeArbiterWorker 간 비동기 큐.
 *
 * 설계 근거: 기존 issueAggregator.mergeViaTrendKeywords는 borderline pair 당
 * 동기적으로 `arbitrateMerge`(Gemini 8s timeout × 50 calls)를 await 하여 최악 400s 소요.
 * 그 동안 aggregateIssues(critical step)가 DB 풀 waiter에 걸려 calculateScores의
 * burst query(8 parallel)가 Supabase 유휴 드롭을 유발.
 * 이 모듈이 기록/조회만 담당하고, 실제 Gemini 호출은 별도 cron worker가 수행.
 */
import type { Pool } from 'pg';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';

export interface PendingPairInput {
  readonly titleA: string;
  readonly titleB: string;
  readonly postAId: number;
  readonly postBId: number;
  readonly cos: number | null;
}

export interface DecidedPair {
  readonly pairHash: string;
  readonly decision: boolean;
}

/** sorted pair → md5. mergeArbiter의 pairKey와 동일 규칙(호환성 중요). */
export function computePairHash(titleA: string, titleB: string): string {
  const [first, second] = titleA < titleB ? [titleA, titleB] : [titleB, titleA];
  return createHash('md5').update(`${first}\u0000${second}`).digest('hex');
}

/**
 * pair를 pending 큐에 기록. 이미 존재하면 무시(ON CONFLICT DO NOTHING).
 * 결정이 이미 있으면 해당 레코드는 유지되어 loadRecentDecisions에서 사용됨.
 */
export async function recordPendingMergeDecisions(
  pool: Pool,
  pairs: readonly PendingPairInput[],
): Promise<number> {
  if (pairs.length === 0) return 0;
  const values: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const p of pairs) {
    const hash = computePairHash(p.titleA, p.titleB);
    values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    params.push(hash, p.postAId, p.postBId, p.titleA.slice(0, 500), p.titleB.slice(0, 500), p.cos);
  }
  try {
    const res = await pool.query(
      `INSERT INTO pending_merge_decisions
         (pair_hash, post_a_id, post_b_id, title_a, title_b, cos)
       VALUES ${values.join(',')}
       ON CONFLICT (pair_hash) DO NOTHING`,
      params,
    );
    return res.rowCount ?? 0;
  } catch (err) {
    logger.warn({ err, count: pairs.length }, '[pendingMergeDecisions] insert failed');
    return 0;
  }
}

/**
 * aggregateIssues가 pair를 만나면: 이전에 결정된 게 있는지 확인 → union/skip 판단.
 * 48h 이내 결정된 pair만 유효 (그 이후는 제목 재사용 확률 높음).
 */
export async function loadRecentDecisions(
  pool: Pool,
  windowHours = 48,
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  try {
    const { rows } = await pool.query<{ pair_hash: string; decision: boolean }>(
      `SELECT pair_hash, decision
         FROM pending_merge_decisions
        WHERE decided_at IS NOT NULL
          AND decided_at > NOW() - make_interval(hours => $1)
          AND decision IS NOT NULL`,
      [windowHours],
    );
    for (const r of rows) map.set(r.pair_hash, r.decision);
  } catch (err) {
    logger.warn({ err }, '[pendingMergeDecisions] load failed — proceeding without cache');
  }
  return map;
}

/** 워커가 pending pair N개를 원자적으로 pick (미결정 only). */
export async function claimPendingPairs(
  pool: Pool,
  limit: number,
): Promise<Array<{ pairHash: string; titleA: string; titleB: string }>> {
  const { rows } = await pool.query<{ pair_hash: string; title_a: string; title_b: string }>(
    `SELECT pair_hash, title_a, title_b
       FROM pending_merge_decisions
      WHERE decided_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit],
  );
  return rows.map(r => ({ pairHash: r.pair_hash, titleA: r.title_a, titleB: r.title_b }));
}

/** 워커가 결정을 기록. */
export async function markDecided(
  pool: Pool,
  pairHash: string,
  decision: boolean,
  source: 'gemini' | 'cache' | 'budget',
): Promise<void> {
  await pool.query(
    `UPDATE pending_merge_decisions
        SET decided_at = NOW(), decision = $2, source = $3
      WHERE pair_hash = $1`,
    [pairHash, decision, source],
  );
}

/** 주기적 청소: 7일 이상된 결정은 제거 (테이블 비대화 방지). */
export async function cleanOldDecisions(pool: Pool): Promise<number> {
  const res = await pool.query(
    `DELETE FROM pending_merge_decisions
      WHERE decided_at IS NOT NULL
        AND decided_at < NOW() - INTERVAL '7 days'`,
  );
  return res.rowCount ?? 0;
}

/** 큐 깊이 모니터링용. */
export async function getPendingBacklog(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM pending_merge_decisions WHERE decided_at IS NULL`,
  );
  return parseInt(rows[0]?.cnt ?? '0', 10);
}
