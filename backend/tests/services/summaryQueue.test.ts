import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_QUEUE_CONFIG,
  computePriority,
  isStaleSummary,
  recordSnapshot,
  buildQueue,
  _resetSnapshot,
  type QueueBuildRow,
} from '../../src/services/summaryQueue.js';

describe('isStaleSummary', () => {
  it('treats null and empty as stale', () => {
    expect(isStaleSummary(null)).toBe(true);
    expect(isStaleSummary('')).toBe(true);
  });

  it('treats [fallback] prefix as stale', () => {
    expect(isStaleSummary('[fallback] 관련 기사 3건')).toBe(true);
  });

  it('treats real summary as fresh', () => {
    expect(isStaleSummary('삼성전자가 1분기 영업이익 6조를 기록했어요.')).toBe(false);
  });
});

describe('computePriority', () => {
  it('applies 6h half-life freshness decay', () => {
    const p0 = computePriority({ issueScore: 100, ageHours: 0, summaryIsStale: false, memberChangeRate: 0 });
    const p6 = computePriority({ issueScore: 100, ageHours: 6, summaryIsStale: false, memberChangeRate: 0 });
    const p12 = computePriority({ issueScore: 100, ageHours: 12, summaryIsStale: false, memberChangeRate: 0 });
    expect(p6).toBeCloseTo(p0 / 2, 5);
    expect(p12).toBeCloseTo(p0 / 4, 5);
  });

  it('max-penalty boost for stale (null/fallback) summaries', () => {
    const fresh = computePriority({ issueScore: 100, ageHours: 0, summaryIsStale: false, memberChangeRate: 0 });
    const stale = computePriority({ issueScore: 100, ageHours: 0, summaryIsStale: true, memberChangeRate: 0 });
    expect(stale / fresh).toBeCloseTo(
      DEFAULT_QUEUE_CONFIG.unsummarizedPenaltyMax / DEFAULT_QUEUE_CONFIG.unsummarizedPenaltyMin,
      5,
    );
  });

  it('applies novelty boost only at/above threshold', () => {
    const below = computePriority({ issueScore: 100, ageHours: 0, summaryIsStale: false, memberChangeRate: 0.29 });
    const atThreshold = computePriority({ issueScore: 100, ageHours: 0, summaryIsStale: false, memberChangeRate: 0.3 });
    const above = computePriority({ issueScore: 100, ageHours: 0, summaryIsStale: false, memberChangeRate: 0.8 });
    expect(atThreshold / below).toBeCloseTo(DEFAULT_QUEUE_CONFIG.noveltyFactor, 5);
    expect(above).toBeCloseTo(atThreshold, 5);
  });

  it('stacks all three multipliers', () => {
    const base = 100;
    const p = computePriority({ issueScore: base, ageHours: 6, summaryIsStale: true, memberChangeRate: 0.5 });
    // 100 × 0.5 × 3.0 × 1.2 = 180
    expect(p).toBeCloseTo(180, 5);
  });

  it('clamps negative age to zero (clock skew safety)', () => {
    const p = computePriority({ issueScore: 100, ageHours: -1, summaryIsStale: false, memberChangeRate: 0 });
    expect(p).toBeCloseTo(100, 5);
  });
});

describe('buildQueue', () => {
  beforeEach(() => {
    _resetSnapshot();
  });

  const mkRow = (over: Partial<QueueBuildRow> = {}): QueueBuildRow => ({
    rowId: 1,
    stableId: 'stable-1',
    issueScore: 100,
    calculatedAt: new Date('2026-04-12T00:00:00Z'),
    summary: 'real summary',
    topPostIds: [1, 2, 3, 4, 5],
    ...over,
  });

  it('sorts by priority desc', () => {
    const now = new Date('2026-04-12T00:00:00Z');
    const rows = [
      mkRow({ rowId: 1, stableId: 's1', issueScore: 50, summary: null }),
      mkRow({ rowId: 2, stableId: 's2', issueScore: 80, summary: 'real' }),
      mkRow({ rowId: 3, stableId: 's3', issueScore: 200, summary: 'real' }),
    ];
    const queue = buildQueue(rows, DEFAULT_QUEUE_CONFIG, now);
    expect(queue.map(q => q.rowId)).toEqual([3, 1, 2]);
    // rowId 3: 200 × 1 × 1 × 1 = 200
    // rowId 1 (stale): 50 × 1 × 3 × 1 = 150
    // rowId 2: 80 × 1 × 1 × 1 = 80
  });

  it('applies novelty factor when prev snapshot differs above threshold', () => {
    const now = new Date('2026-04-12T00:00:00Z');
    recordSnapshot('s1', [1, 2, 3, 4, 5]);
    recordSnapshot('s2', [1, 2, 3, 4, 5]);
    const queue = buildQueue(
      [
        mkRow({ rowId: 1, stableId: 's1', issueScore: 100, topPostIds: [1, 2, 3, 4, 5] }), // unchanged
        mkRow({ rowId: 2, stableId: 's2', issueScore: 100, topPostIds: [10, 11, 12, 13, 14] }), // all new
      ],
      DEFAULT_QUEUE_CONFIG,
      now,
    );
    const byId = new Map(queue.map(q => [q.rowId, q]));
    expect(byId.get(1)!.memberChangeRate).toBeCloseTo(0, 5);
    expect(byId.get(2)!.memberChangeRate).toBeCloseTo(1, 5);
    expect(byId.get(2)!.priority / byId.get(1)!.priority).toBeCloseTo(
      DEFAULT_QUEUE_CONFIG.noveltyFactor,
      5,
    );
  });

  it('first-tick rows (no snapshot) get no novelty boost', () => {
    const now = new Date('2026-04-12T00:00:00Z');
    const queue = buildQueue(
      [mkRow({ rowId: 1, stableId: 'fresh-new', issueScore: 100, topPostIds: [1, 2, 3] })],
      DEFAULT_QUEUE_CONFIG,
      now,
    );
    expect(queue[0].memberChangeRate).toBe(0);
    expect(queue[0].priority).toBeCloseTo(100, 5);
  });

  it('handles null stableId without crashing', () => {
    const now = new Date('2026-04-12T00:00:00Z');
    const queue = buildQueue(
      [mkRow({ rowId: 1, stableId: null, issueScore: 100 })],
      DEFAULT_QUEUE_CONFIG,
      now,
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].priority).toBeGreaterThan(0);
  });
});
