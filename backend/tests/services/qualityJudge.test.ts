import { describe, it, expect } from 'vitest';
import {
  parseJudgeResponse,
  aggregateJudgments,
  formatJudgeReport,
  type JudgeResult,
} from '../../src/services/qualityJudge.js';

function makeResult(overrides: Partial<JudgeResult> = {}): JudgeResult {
  return {
    issueId: 1,
    stableId: 'abc123',
    coherenceScore: 8,
    titleQuality: 7,
    summaryQuality: 9,
    outlierPostIds: [],
    primaryTopic: '테스트',
    explanation: '',
    promptTokens: 100,
    completionTokens: 50,
    costUsd: 0.0001,
    ...overrides,
  };
}

describe('parseJudgeResponse', () => {
  it('parses clean JSON', () => {
    const out = parseJudgeResponse('{"coherence_score":8,"title_quality":7,"summary_quality":9,"primary_topic":"x","outliers":[],"explanation":"y"}');
    expect(out?.coherence_score).toBe(8);
    expect(out?.outliers).toEqual([]);
  });

  it('strips ```json fences', () => {
    const out = parseJudgeResponse('```json\n{"coherence_score":5,"title_quality":5,"summary_quality":5,"primary_topic":"a","outliers":[1,2],"explanation":"e"}\n```');
    expect(out?.coherence_score).toBe(5);
    expect(out?.outliers).toEqual([1, 2]);
  });

  it('strips BOM', () => {
    const out = parseJudgeResponse('\uFEFF{"coherence_score":3,"title_quality":3,"summary_quality":3,"primary_topic":"t","outliers":[],"explanation":"e"}');
    expect(out?.coherence_score).toBe(3);
  });

  it('returns null on broken JSON without throwing', () => {
    const out = parseJudgeResponse('{"coherence_score": this is broken');
    expect(out).toBeNull();
  });

  it('handles array-wrapped response', () => {
    const out = parseJudgeResponse('[{"coherence_score":4,"title_quality":4,"summary_quality":4,"primary_topic":"a","outliers":[],"explanation":"e"}]');
    expect(out?.coherence_score).toBe(4);
  });
});

describe('aggregateJudgments', () => {
  it('returns zeros for empty', () => {
    const a = aggregateJudgments([]);
    expect(a.count).toBe(0);
    expect(a.coherenceAvg).toBe(0);
    expect(a.lowCoherenceCount).toBe(0);
    expect(a.outlierRatio).toBe(0);
  });

  it('counts low coherence (<6)', () => {
    const a = aggregateJudgments([
      makeResult({ coherenceScore: 3 }),
      makeResult({ coherenceScore: 5.9 }),
      makeResult({ coherenceScore: 6 }),
      makeResult({ coherenceScore: 9 }),
    ]);
    expect(a.count).toBe(4);
    expect(a.lowCoherenceCount).toBe(2);
  });

  it('computes outlier ratio', () => {
    const a = aggregateJudgments([
      makeResult({ outlierPostIds: [1] }),
      makeResult({ outlierPostIds: [] }),
      makeResult({ outlierPostIds: [2, 3] }),
      makeResult({ outlierPostIds: [] }),
    ]);
    expect(a.outlierRatio).toBe(0.5);
  });

  it('averages title and summary quality', () => {
    const a = aggregateJudgments([
      makeResult({ titleQuality: 6, summaryQuality: 8 }),
      makeResult({ titleQuality: 8, summaryQuality: 4 }),
    ]);
    expect(a.titleQualityAvg).toBe(7);
    expect(a.summaryQualityAvg).toBe(6);
  });

  it('sums cost', () => {
    const a = aggregateJudgments([
      makeResult({ costUsd: 0.001 }),
      makeResult({ costUsd: 0.002 }),
      makeResult({ costUsd: 0.003 }),
    ]);
    expect(a.totalCostUsd).toBeCloseTo(0.006, 6);
  });

  it('treats missing coherence as 0 (worst case for low count)', () => {
    const a = aggregateJudgments([makeResult({ coherenceScore: null })]);
    expect(a.coherenceAvg).toBe(0);
    expect(a.lowCoherenceCount).toBe(0); // null → defaults to 10 in low check
  });
});

describe('formatJudgeReport', () => {
  it('shows empty message when no judgments', () => {
    const text = formatJudgeReport({
      batchResult: { judged: 0, skipped: 0, failed: 0, totalCostUsd: 0, results: [], elapsedMs: 0 },
      aggregate: aggregateJudgments([]),
    });
    expect(text).toMatch(/평가 대상 없음/);
  });

  it('lists low coherence issues', () => {
    const results = [
      makeResult({ issueId: 100, coherenceScore: 4 }),
      makeResult({ issueId: 101, coherenceScore: 9 }),
      makeResult({ issueId: 102, coherenceScore: 3 }),
    ];
    const text = formatJudgeReport({
      batchResult: { judged: 3, skipped: 0, failed: 0, totalCostUsd: 0.005, results, elapsedMs: 1000 },
      aggregate: aggregateJudgments(results),
    });
    expect(text).toMatch(/avg coherence/);
    expect(text).toMatch(/#100/);
    expect(text).toMatch(/#102/);
    expect(text).not.toMatch(/#101/);
  });

  it('reports cost with 4 decimals', () => {
    const results = [makeResult({ coherenceScore: 8, costUsd: 0.0123 })];
    const text = formatJudgeReport({
      batchResult: { judged: 1, skipped: 0, failed: 0, totalCostUsd: 0.0123, results, elapsedMs: 100 },
      aggregate: aggregateJudgments(results),
    });
    expect(text).toMatch(/\$0\.0123/);
  });
});
