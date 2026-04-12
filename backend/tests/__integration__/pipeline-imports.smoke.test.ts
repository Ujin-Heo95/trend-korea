/**
 * Pipeline imports smoke test.
 *
 * Goal: catch module-load failures (top-level TDZ, import cycle breakage,
 * missing re-exports, wrong default-export consumption) BEFORE they ship to
 * production. The full in-function TDZ class is caught by `scripts/deploy.sh`
 * post-deploy freshness polling, not here — replicating the entire
 * issueAggregator schema in pg-mem is excessive maintenance.
 *
 * Why this exists: 2026-04-12 사고 — `mergeViaTrendKeywords` 안의 const TDZ
 * 가 prod 첫 tick 까지 잠복. 단위 테스트는 다른 함수만 호출하느라 path 미커버.
 * 이 smoke 가 import 시점에 동일한 module graph 를 강제로 적재하므로,
 * top-level/lexical 에러는 여기서 즉시 RED.
 */
import { describe, it, expect } from 'vitest';

describe('pipeline imports smoke', () => {
  it('issueMaterializer module loads and exports the expected functions', async () => {
    const mod = await import('../../src/services/issueMaterializer.js');
    expect(typeof mod.materializeIssueResponse).toBe('function');
    expect(typeof mod.snapshotRankings).toBe('function');
    expect(typeof mod.cleanExpiredIssueRankings).toBe('function');
  });

  it('v8 pipeline module loads and exports runV8Pipeline', async () => {
    const mod = await import('../../src/services/v8/pipeline.js');
    expect(typeof mod.runV8Pipeline).toBe('function');
  });

  it('scheduler module loads and exports startScheduler', async () => {
    const mod = await import('../../src/scheduler/index.js');
    expect(typeof mod.startScheduler).toBe('function');
  });

  it('watchdog module loads and exports startWebWatchdog + watchdog runners', async () => {
    const mod = await import('../../src/scheduler/watchdog.js');
    expect(typeof mod.startWebWatchdog).toBe('function');
    expect(typeof mod.runIssueWatchdog).toBe('function');
    expect(typeof mod.runIssueProbe).toBe('function');
  });

  it('pipelineLock module loads and exposes withPipelineLock + key map', async () => {
    const mod = await import('../../src/services/pipelineLock.js');
    expect(typeof mod.withPipelineLock).toBe('function');
    expect(mod.PIPELINE_LOCK_KEYS).toBeDefined();
  });

  it('server module loads (buildApp factory present)', async () => {
    const mod = await import('../../src/server.js');
    expect(typeof mod.buildApp).toBe('function');
  });
});
