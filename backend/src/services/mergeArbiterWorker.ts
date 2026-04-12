/**
 * mergeArbiterWorker — pending_merge_decisions 큐를 소비하는 비동기 Gemini 중재자.
 *
 * issueAggregator는 borderline pair를 pending 큐에 기록만 한다(동기 Gemini 호출 금지).
 * 이 워커가 독립 cron(:06,:16,...)에서 pending pair를 batch pick → p-limit(5) 병렬 호출 →
 * 결정을 markDecided로 기록. 다음 aggregateIssues tick이 결정 맵을 미리 로드해 union/skip.
 *
 * 장점:
 *   - critical path(aggregateIssues)에서 외부 HTTP I/O 제거 → 시간 상한 예측 가능.
 *   - 병렬화(5) + cross-tick 캐시 → 같은 쿼터 내 더 많은 pair 처리.
 *   - 워커 실패가 파이프라인 전체를 중단시키지 않음 (격리).
 */
import type { Pool } from 'pg';
import pLimit from 'p-limit';
import { logger } from '../utils/logger.js';
import {
  claimPendingPairs,
  markDecided,
  getPendingBacklog,
  cleanOldDecisions,
} from './pendingMergeDecisions.js';
import { arbitrateMerge, resetArbiterBatchState } from './mergeArbiter.js';

const BATCH_LIMIT = 50;           // 한 tick에 최대 50 pair
const PARALLELISM = 5;             // p-limit 동시 호출
const WORKER_BUDGET_MS = 60_000;   // 전체 상한 60s (8s × 5 parallel 여유)

let isRunning = false;

export async function runMergeArbiterWorker(pool: Pool): Promise<{ processed: number; backlog: number }> {
  if (isRunning) {
    logger.warn('[mergeArbiterWorker] previous run still active — skipping');
    return { processed: 0, backlog: await getPendingBacklog(pool).catch(() => -1) };
  }
  isRunning = true;
  const started = Date.now();
  let processed = 0;
  let merged = 0;
  let rejected = 0;
  let fromCache = 0;
  let budgetSkipped = 0;

  try {
    const backlogBefore = await getPendingBacklog(pool);
    if (backlogBefore === 0) {
      logger.info('[mergeArbiterWorker] empty queue');
      // 주기적 청소 (하루 1회 정도면 충분 — 매 tick 실행해도 부하 미미)
      await cleanOldDecisions(pool).catch(() => 0);
      return { processed: 0, backlog: 0 };
    }

    const pairs = await claimPendingPairs(pool, BATCH_LIMIT);
    resetArbiterBatchState(BATCH_LIMIT);

    const limit = pLimit(PARALLELISM);
    const deadline = started + WORKER_BUDGET_MS;

    await Promise.all(
      pairs.map(pair =>
        limit(async () => {
          if (Date.now() > deadline) {
            budgetSkipped++;
            return;
          }
          try {
            const result = await arbitrateMerge(pair.titleA, pair.titleB);
            if (result.skipped === 'budget') {
              budgetSkipped++;
              return;
            }
            if (result.skipped === 'no_key') {
              // API key 미설정 — 큐에 쌓지 말고 false로 결정 기록해 무한 재시도 방지
              await markDecided(pool, pair.pairHash, false, 'budget');
              rejected++;
              processed++;
              return;
            }
            const source: 'gemini' | 'cache' = result.fromCache ? 'cache' : 'gemini';
            await markDecided(pool, pair.pairHash, result.sameEvent, source);
            if (result.sameEvent) merged++;
            else rejected++;
            if (result.fromCache) fromCache++;
            processed++;
          } catch (err) {
            logger.warn(
              { err, pairHash: pair.pairHash },
              '[mergeArbiterWorker] pair failed',
            );
          }
        }),
      ),
    );

    const backlogAfter = await getPendingBacklog(pool);
    logger.info(
      {
        processed, merged, rejected, fromCache, budgetSkipped,
        backlogBefore, backlogAfter,
        elapsedMs: Date.now() - started,
      },
      '[mergeArbiterWorker] tick complete',
    );
    return { processed, backlog: backlogAfter };
  } catch (err) {
    logger.error({ err }, '[mergeArbiterWorker] tick failed');
    return { processed, backlog: -1 };
  } finally {
    isRunning = false;
  }
}
