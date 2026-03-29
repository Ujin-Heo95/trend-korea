import { describe, it, expect } from 'vitest';
import { computeScore, getSourceWeight, getCategoryWeight } from '../../src/services/scoring.js';

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
    expect(getCategoryWeight('community')).toBe(1.00);
    expect(getCategoryWeight('government')).toBe(0.85);
  });

  it('returns default weight for null/unknown', () => {
    expect(getCategoryWeight(null)).toBe(1.00);
    expect(getCategoryWeight('unknown')).toBe(1.00);
  });
});

describe('computeScore', () => {
  it('returns 0 for zero engagement and large age', () => {
    const score = computeScore(0, 0, 10000, 1.0, 1.0);
    expect(score).toBeCloseTo(0, 5);
  });

  it('higher views produce higher score', () => {
    const low = computeScore(100, 0, 60, 1.0, 1.0);
    const high = computeScore(10000, 0, 60, 1.0, 1.0);
    expect(high).toBeGreaterThan(low);
  });

  it('comments weighted 1.5x more than views', () => {
    const viewOnly = computeScore(100, 0, 0, 1.0, 1.0);
    const commentOnly = computeScore(0, 100, 0, 1.0, 1.0);
    expect(commentOnly).toBeGreaterThan(viewOnly);
  });

  it('score decays over time with 6h half-life', () => {
    const fresh = computeScore(1000, 50, 0, 1.0, 1.0);
    const sixHours = computeScore(1000, 50, 360, 1.0, 1.0);
    expect(sixHours).toBeCloseTo(fresh / 2, 1);
  });

  it('source and category weights multiply', () => {
    const base = computeScore(1000, 50, 60, 1.0, 1.0);
    const boosted = computeScore(1000, 50, 60, 1.15, 1.20);
    expect(boosted).toBeCloseTo(base * 1.15 * 1.20, 1);
  });

  it('cluster bonus applies correctly', () => {
    const single = computeScore(1000, 50, 60, 1.0, 1.0, 1.0);
    const clustered = computeScore(1000, 50, 60, 1.0, 1.0, 1.3);
    expect(clustered).toBeCloseTo(single * 1.3, 1);
  });
});
