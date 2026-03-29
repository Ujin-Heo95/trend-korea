import { describe, it, expect } from 'vitest';
import { computeScore, computeScoreLegacy, getSourceWeight, getCategoryWeight, type ScoreFactors } from '../../src/services/scoring.js';

describe('getSourceWeight', () => {
  it('returns correct weight for known sources', () => {
    expect(getSourceWeight('yna')).toBe(1.15);
    expect(getSourceWeight('dcinside')).toBe(1.05);
    expect(getSourceWeight('youtube')).toBe(1.03);
  });

  it('returns default weight for unknown sources', () => {
    expect(getSourceWeight('unknown_source')).toBe(0.95);
  });
});

describe('getCategoryWeight', () => {
  it('returns correct weight for known categories', () => {
    expect(getCategoryWeight('news')).toBe(1.20);
    expect(getCategoryWeight('community')).toBe(1.08);
    expect(getCategoryWeight('government')).toBe(0.85);
  });

  it('returns default weight for null/unknown', () => {
    expect(getCategoryWeight(null)).toBe(1.00);
    expect(getCategoryWeight('unknown')).toBe(1.00);
  });
});

/** 기본 factors 생성 헬퍼 */
function makeFactors(overrides: Partial<ScoreFactors> = {}): ScoreFactors {
  return {
    normalizedEngagement: 3.0,
    decay: 1.0,
    sourceWeight: 1.0,
    categoryWeight: 1.0,
    velocityBonus: 1.0,
    clusterBonus: 1.0,
    keywordMomentumBonus: 1.0,
    trendConfirmationBonus: 1.0,
    ...overrides,
  };
}

describe('computeScore (new formula)', () => {
  it('all factors multiply together', () => {
    const factors = makeFactors({
      normalizedEngagement: 2.0,
      decay: 0.5,
      sourceWeight: 1.15,
      categoryWeight: 1.20,
    });
    const expected = 2.0 * 0.5 * 1.15 * 1.20;
    expect(computeScore(factors)).toBeCloseTo(expected, 5);
  });

  it('velocity bonus increases score', () => {
    const base = computeScore(makeFactors());
    const boosted = computeScore(makeFactors({ velocityBonus: 1.5 }));
    expect(boosted).toBeCloseTo(base * 1.5, 5);
  });

  it('cluster bonus increases score', () => {
    const base = computeScore(makeFactors());
    const clustered = computeScore(makeFactors({ clusterBonus: 2.0 }));
    expect(clustered).toBeCloseTo(base * 2.0, 5);
  });

  it('keyword momentum bonus increases score', () => {
    const base = computeScore(makeFactors());
    const momentum = computeScore(makeFactors({ keywordMomentumBonus: 1.3 }));
    expect(momentum).toBeCloseTo(base * 1.3, 5);
  });

  it('trend confirmation bonus increases score', () => {
    const base = computeScore(makeFactors());
    const confirmed = computeScore(makeFactors({ trendConfirmationBonus: 1.25 }));
    expect(confirmed).toBeCloseTo(base * 1.25, 5);
  });

  it('all bonuses compound multiplicatively', () => {
    const factors = makeFactors({
      normalizedEngagement: 2.5,
      decay: 0.8,
      sourceWeight: 1.10,
      categoryWeight: 1.15,
      velocityBonus: 1.3,
      clusterBonus: 1.6,
      keywordMomentumBonus: 1.2,
      trendConfirmationBonus: 1.1,
    });
    const expected = 2.5 * 0.8 * 1.10 * 1.15 * 1.3 * 1.6 * 1.2 * 1.1;
    expect(computeScore(factors)).toBeCloseTo(expected, 3);
  });

  it('minimum engagement floor prevents zero scores', () => {
    const score = computeScore(makeFactors({ normalizedEngagement: 0.5 }));
    expect(score).toBeGreaterThan(0);
  });
});

describe('computeScoreLegacy (backward compat)', () => {
  it('returns near-zero for zero engagement and large age', () => {
    const score = computeScoreLegacy(0, 0, 10000, 1.0, 1.0);
    expect(score).toBeCloseTo(0, 5);
  });

  it('higher views produce higher score', () => {
    const low = computeScoreLegacy(100, 0, 60, 1.0, 1.0);
    const high = computeScoreLegacy(10000, 0, 60, 1.0, 1.0);
    expect(high).toBeGreaterThan(low);
  });

  it('comments weighted 1.5x more than views', () => {
    const viewOnly = computeScoreLegacy(100, 0, 0, 1.0, 1.0);
    const commentOnly = computeScoreLegacy(0, 100, 0, 1.0, 1.0);
    expect(commentOnly).toBeGreaterThan(viewOnly);
  });

  it('score decays over time with 6h half-life', () => {
    const fresh = computeScoreLegacy(1000, 50, 0, 1.0, 1.0);
    const sixHours = computeScoreLegacy(1000, 50, 360, 1.0, 1.0);
    expect(sixHours).toBeCloseTo(fresh / 2, 1);
  });

  it('source and category weights multiply', () => {
    const base = computeScoreLegacy(1000, 50, 60, 1.0, 1.0);
    const boosted = computeScoreLegacy(1000, 50, 60, 1.15, 1.20);
    expect(boosted).toBeCloseTo(base * 1.15 * 1.20, 1);
  });

  it('cluster bonus applies correctly', () => {
    const single = computeScoreLegacy(1000, 50, 60, 1.0, 1.0, 1.0);
    const clustered = computeScoreLegacy(1000, 50, 60, 1.0, 1.0, 1.3);
    expect(clustered).toBeCloseTo(single * 1.3, 1);
  });
});
