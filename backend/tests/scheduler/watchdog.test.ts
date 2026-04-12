/**
 * watchdog 유닛 테스트 — DB 쿼리 결과를 mock 해서 L1/L2 분기를 커버.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';

// discord/pipelineLock/aggregator 를 무력화
vi.mock('../../src/services/discord.js', () => ({
  notifyPipelineWarning: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/services/pipelineLock.js', () => ({
  withPipelineLock: vi.fn(async (_pool, _key, _name, fn: () => Promise<unknown>) => fn()),
  PIPELINE_LOCK_KEYS: { issuePipeline: 1 },
}));
const aggregateMock = vi.fn().mockResolvedValue(undefined);
const materializeMock = vi.fn().mockResolvedValue(undefined);
const calculateScoresMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/services/issueAggregator.js', () => ({
  aggregateIssues: aggregateMock,
  materializeIssueResponse: materializeMock,
}));
vi.mock('../../src/services/scoring.js', () => ({
  calculateScores: calculateScoresMock,
}));
const clearCacheMock = vi.fn();
vi.mock('../../src/routes/issues.js', () => ({
  clearIssuesCache: clearCacheMock,
}));

const { runIssueWatchdog, runIssueProbe, getWatchdogStatus } = await import('../../src/scheduler/watchdog.js');

function makePool(queryImpl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>): Pool {
  return { query: queryImpl as Pool['query'] } as unknown as Pool;
}

describe('runIssueWatchdog (L1)', () => {
  beforeEach(() => {
    aggregateMock.mockClear();
    materializeMock.mockClear();
    clearCacheMock.mockClear();
    calculateScoresMock.mockClear();
  });

  it('returns ok when MAX(calculated_at) age < 15 min', async () => {
    const pool = makePool(async () => ({ rows: [{ age_sec: 120 }] }));
    const result = await runIssueWatchdog(pool);
    expect(result).toBe('ok');
    expect(aggregateMock).not.toHaveBeenCalled();
    expect(calculateScoresMock).not.toHaveBeenCalled();
  });

  it('forces full critical path recovery when stale > 15 min (includes calculateScores)', async () => {
    const pool = makePool(async () => ({ rows: [{ age_sec: 18 * 60 }] }));
    const result = await runIssueWatchdog(pool);
    expect(result).toBe('recovered');
    expect(calculateScoresMock).toHaveBeenCalledOnce();
    expect(aggregateMock).toHaveBeenCalledOnce();
    expect(materializeMock).toHaveBeenCalledOnce();
    expect(clearCacheMock).toHaveBeenCalledOnce();
  });

  it('forces recovery when table is empty', async () => {
    const pool = makePool(async () => ({ rows: [{ age_sec: null }] }));
    const result = await runIssueWatchdog(pool);
    expect(result).toBe('recovered');
  });

  it('returns failed when aggregate throws', async () => {
    aggregateMock.mockRejectedValueOnce(new Error('DB blew up'));
    const pool = makePool(async () => ({ rows: [{ age_sec: 18 * 60 }] }));
    const result = await runIssueWatchdog(pool);
    expect(result).toBe('failed');
  });
});

describe('runIssueProbe (L2)', () => {
  beforeEach(() => {
    aggregateMock.mockClear();
    materializeMock.mockClear();
  });

  it('passes when fresh + coherent', async () => {
    const now = Date.now();
    const issues = [
      { title: 'topic alpha news one', summary: 'real summary', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: 'topic beta news two', summary: 'real summary', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: 'topic gamma news three', summary: 'real summary', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: 'topic delta news four', summary: 'real summary', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: 'topic epsilon news five', summary: 'real summary', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
    ];
    const pool = makePool(async () => ({ rows: issues }));
    const result = await runIssueProbe(pool);
    expect(result.ok).toBe(true);
    expect(result.duplicate_title_count).toBe(0);
    expect(result.fallback_ratio).toBe(0);
  });

  it('detects duplicate normalized titles + triggers L1', async () => {
    const now = Date.now();
    const dup = 'same exact title every where';
    const issues = [
      { title: dup, summary: 'x', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: dup, summary: 'x', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: 'other unique title alpha', summary: 'x', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: 'other unique title beta', summary: 'x', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: 'other unique title gamma', summary: 'x', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
    ];
    const pool = makePool(async () => ({ rows: issues }));
    const result = await runIssueProbe(pool);
    expect(result.ok).toBe(false);
    expect(result.duplicate_title_count).toBe(1);
    expect(result.reasons.join(',')).toContain('duplicate_titles');
  });

  it('detects high fallback ratio', async () => {
    const now = Date.now();
    const issues = Array.from({ length: 5 }, (_, i) => ({
      title: `real title ${i} one two`,
      summary: i < 4 ? '[fallback] 관련 기사 3건' : 'real summary',
      calculated_at: new Date(now - 60_000).toISOString(),
    }));
    const pool = makePool(async () => ({ rows: issues }));
    const result = await runIssueProbe(pool);
    expect(result.ok).toBe(false);
    expect(result.fallback_ratio).toBeCloseTo(0.8);
    expect(result.reasons.join(',')).toContain('fallback_ratio');
  });

  it('detects stale age', async () => {
    const now = Date.now();
    const issues = Array.from({ length: 5 }, (_, i) => ({
      title: `title ${i} unique text here`,
      summary: 'real',
      calculated_at: new Date(now - 400_000).toISOString(), // 6.6min ago
      news_post_count: 3,
      cluster_ids: [],
      standalone_post_ids: [],
    }));
    const pool = makePool(async () => ({ rows: issues }));
    const result = await runIssueProbe(pool);
    expect(result.ok).toBe(false);
    expect((result.age_sec ?? 0) > 300).toBe(true);
  });

  it('detects zombie data — all rows with news_post_count=0 (2026-04-12 empty UI fix)', async () => {
    const now = Date.now();
    const issues = Array.from({ length: 5 }, (_, i) => ({
      title: `zombie title ${i} valid text`,
      summary: 'real',
      calculated_at: new Date(now - 60_000).toISOString(),
      news_post_count: 0, // 전 행이 news 0 → route 가 빈 배열 반환
      cluster_ids: [],
      standalone_post_ids: [],
    }));
    const pool = makePool(async () => ({ rows: issues }));
    const result = await runIssueProbe(pool);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(',')).toContain('zombie_data');
  });

  it('short titles (<8 chars) are not considered for dup check', async () => {
    const now = Date.now();
    const issues = [
      { title: '속보', summary: 'x', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: '속보', summary: 'x', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: 'full length unique title a', summary: 'x', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: 'full length unique title b', summary: 'x', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
      { title: 'full length unique title c', summary: 'x', calculated_at: new Date(now - 60_000).toISOString(), news_post_count: 3, cluster_ids: [], standalone_post_ids: [] },
    ];
    const pool = makePool(async () => ({ rows: issues }));
    const result = await runIssueProbe(pool);
    expect(result.duplicate_title_count).toBe(0);
  });
});

describe('status exposure', () => {
  it('getWatchdogStatus returns snapshot shape', () => {
    const s = getWatchdogStatus();
    expect(s).toHaveProperty('last_check_at');
    expect(s).toHaveProperty('recovery_count_24h');
    expect(s).toHaveProperty('probe_failure_count_24h');
  });
});
