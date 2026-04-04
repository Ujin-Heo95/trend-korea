import { describe, it, expect } from 'vitest';
import {
  computeScore, computeScoreLegacy, getSourceWeight, getCategoryWeight,
  getHalfLife, volumeDampeningFactor, type ScoreFactors,
} from '../../src/services/scoring.js';

const LN2 = Math.LN2;

describe('getSourceWeight', () => {
  it('returns T1 weight for 통신사·집계', () => {
    expect(getSourceWeight('yna')).toBe(2.5);
    expect(getSourceWeight('naver_news_ranking')).toBe(2.5);
    expect(getSourceWeight('bigkinds_issues')).toBe(2.5);
    expect(getSourceWeight('youtube')).toBe(2.5);
  });

  it('returns T2 weight for 방송사+조중', () => {
    expect(getSourceWeight('sbs')).toBe(2.2);
    expect(getSourceWeight('kbs')).toBe(2.2);
    expect(getSourceWeight('chosun')).toBe(2.2);
  });

  it('returns T3 weight for 주요 언론', () => {
    expect(getSourceWeight('khan')).toBe(2.0);
    expect(getSourceWeight('mk')).toBe(2.0);
    expect(getSourceWeight('hani')).toBe(2.0);
    expect(getSourceWeight('ytn')).toBe(2.0);
  });

  it('returns 1.0 for community sources', () => {
    expect(getSourceWeight('dcinside')).toBe(1.0);
    expect(getSourceWeight('theqoo')).toBe(1.0);
    expect(getSourceWeight('natepann')).toBe(1.0);
  });

  it('returns 0.9 for hotdeal sources', () => {
    expect(getSourceWeight('ruliweb_hot')).toBe(0.9);
    expect(getSourceWeight('clien_jirum')).toBe(0.9);
  });

  it('returns default 0.8 for unknown sources', () => {
    expect(getSourceWeight('unknown_source')).toBe(0.8);
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

describe('getHalfLife', () => {
  it('community decays fastest (150min)', () => {
    expect(getHalfLife('community')).toBe(150);
  });

  it('sns decays even faster (120min)', () => {
    expect(getHalfLife('sns')).toBe(120);
  });

  it('news decays at 4h (240min)', () => {
    expect(getHalfLife('news')).toBe(240);
  });

  it('video retains longest (360min)', () => {
    expect(getHalfLife('video')).toBe(360);
  });
});

describe('channel-specific decay', () => {
  it('community at 24h is near zero (<0.2%)', () => {
    const decay24h = Math.exp(-Math.LN2 * 1440 / 150);
    expect(decay24h).toBeLessThan(0.002);
  });

  it('news at 24h retains ~1.5%', () => {
    const decay24h = Math.exp(-Math.LN2 * 1440 / 240);
    expect(decay24h).toBeCloseTo(0.0156, 3);
  });

  it('video at 6h is exactly half', () => {
    const decay6h = Math.exp(-Math.LN2 * 360 / 360);
    expect(decay6h).toBeCloseTo(0.5, 5);
  });

  it('community decays faster than news at same age', () => {
    const age = 360; // 6h
    const communityDecay = Math.exp(-Math.LN2 * age / 150);
    const newsDecay = Math.exp(-Math.LN2 * age / 240);
    expect(communityDecay).toBeLessThan(newsDecay);
  });
});

describe('volumeDampeningFactor', () => {
  it('returns 1.0 for sources at or below median', () => {
    expect(volumeDampeningFactor(5, 10)).toBe(1.0);
    expect(volumeDampeningFactor(10, 10)).toBe(1.0);
  });

  it('dampens high-volume sources', () => {
    // 5x median → 1.0 - 0.15 * ln(5) ≈ 0.759
    const factor = volumeDampeningFactor(50, 10);
    expect(factor).toBeCloseTo(0.759, 2);
    expect(factor).toBeLessThan(1.0);
  });

  it('never goes below 0.7 floor', () => {
    expect(volumeDampeningFactor(10000, 1)).toBe(0.7);
  });

  it('handles medianCount <= 0', () => {
    expect(volumeDampeningFactor(10, 0)).toBe(1.0);
    expect(volumeDampeningFactor(10, -1)).toBe(1.0);
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
    burstBonus: 1.0,
    ...overrides,
  };
}

describe('computeScore (new formula)', () => {
  it('all factors multiply together', () => {
    const factors = makeFactors({
      normalizedEngagement: 2.0,
      decay: 0.5,
      sourceWeight: 2.5,
      categoryWeight: 1.20,
    });
    const expected = 2.0 * 0.5 * 2.5 * 1.20;
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
      sourceWeight: 2.2,
      categoryWeight: 1.15,
      velocityBonus: 1.3,
      clusterBonus: 1.6,
      keywordMomentumBonus: 1.2,
      trendConfirmationBonus: 1.1,
    });
    const expected = 2.5 * 0.8 * 2.2 * 1.15 * 1.3 * 1.6 * 1.2 * 1.1;
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

  it('score decays with channel-specific half-life (news=4h)', () => {
    const fresh = computeScoreLegacy(1000, 50, 0, 1.0, 1.0, 1.0, 'news');
    const fourHours = computeScoreLegacy(1000, 50, 240, 1.0, 1.0, 1.0, 'news');
    expect(fourHours).toBeCloseTo(fresh / 2, 1);
  });

  it('community decays at 2.5h half-life', () => {
    const fresh = computeScoreLegacy(1000, 50, 0, 1.0, 1.0, 1.0, 'community');
    const halfLife = computeScoreLegacy(1000, 50, 150, 1.0, 1.0, 1.0, 'community');
    expect(halfLife).toBeCloseTo(fresh / 2, 1);
  });

  it('default channel (specialized) uses 5h half-life', () => {
    const fresh = computeScoreLegacy(1000, 50, 0, 1.0, 1.0);
    const fiveHours = computeScoreLegacy(1000, 50, 300, 1.0, 1.0);
    expect(fiveHours).toBeCloseTo(fresh / 2, 1);
  });

  it('source and category weights multiply', () => {
    const base = computeScoreLegacy(1000, 50, 60, 1.0, 1.0);
    const boosted = computeScoreLegacy(1000, 50, 60, 2.5, 1.20);
    expect(boosted).toBeCloseTo(base * 2.5 * 1.20, 1);
  });

  it('cluster bonus applies correctly', () => {
    const single = computeScoreLegacy(1000, 50, 60, 1.0, 1.0, 1.0);
    const clustered = computeScoreLegacy(1000, 50, 60, 1.0, 1.0, 1.3);
    expect(clustered).toBeCloseTo(single * 1.3, 1);
  });
});

describe('cross-channel differentiation (raw score)', () => {
  it('T1 news outscores community at same engagement and age', () => {
    const newsFactors: ScoreFactors = {
      normalizedEngagement: 3.0,
      decay: 0.75,           // ~1h old, news half-life 240min
      sourceWeight: 2.5,     // T1
      categoryWeight: 1.20,  // news
      velocityBonus: 1.0,
      clusterBonus: 1.0,
      keywordMomentumBonus: 1.0,
      trendConfirmationBonus: 1.0,
      burstBonus: 1.0,
    };
    const communityFactors: ScoreFactors = {
      normalizedEngagement: 3.0,
      decay: 0.75,           // same age, community half-life 150min → faster decay
      sourceWeight: 1.0,     // community
      categoryWeight: 1.08,  // community
      velocityBonus: 1.0,
      clusterBonus: 1.0,
      keywordMomentumBonus: 1.0,
      trendConfirmationBonus: 1.0,
      burstBonus: 1.0,
    };
    const newsScore = computeScore(newsFactors);
    const communityScore = computeScore(communityFactors);
    expect(newsScore).toBeGreaterThan(communityScore);
    // T1 news should be ~2.78x community (2.5*1.2 / 1.0*1.08)
    expect(newsScore / communityScore).toBeCloseTo(2.5 * 1.2 / (1.0 * 1.08), 1);
  });

  it('decay reduces raw score absolutely over time', () => {
    const fresh: ScoreFactors = {
      normalizedEngagement: 4.0,
      decay: 1.0,            // just scraped
      sourceWeight: 2.0,
      categoryWeight: 1.0,
      velocityBonus: 1.0,
      clusterBonus: 1.0,
      keywordMomentumBonus: 1.0,
      trendConfirmationBonus: 1.0,
      burstBonus: 1.0,
    };
    const aged: ScoreFactors = {
      ...fresh,
      decay: Math.exp(-LN2 * 240 / 240), // 4h old news → 50% decay
    };
    expect(computeScore(fresh)).toBe(8.0);  // 4.0 * 1.0 * 2.0 * 1.0
    expect(computeScore(aged)).toBeCloseTo(4.0, 1);  // 50% of fresh
  });

  it('high-engagement community cannot beat T1 news by engagement alone', () => {
    const newsNormal: ScoreFactors = {
      normalizedEngagement: 3.0,
      decay: 0.9,
      sourceWeight: 2.5,
      categoryWeight: 1.20,
      velocityBonus: 1.0,
      clusterBonus: 1.0,
      keywordMomentumBonus: 1.0,
      trendConfirmationBonus: 1.0,
      burstBonus: 1.0,
    };
    const communityHigh: ScoreFactors = {
      normalizedEngagement: 5.0,  // much higher engagement
      decay: 0.9,
      sourceWeight: 1.0,
      categoryWeight: 1.08,
      velocityBonus: 1.0,
      clusterBonus: 1.0,
      keywordMomentumBonus: 1.0,
      trendConfirmationBonus: 1.0,
      burstBonus: 1.0,
    };
    // news: 3.0 * 0.9 * 2.5 * 1.2 = 8.1
    // community: 5.0 * 0.9 * 1.0 * 1.08 = 4.86
    expect(computeScore(newsNormal)).toBeGreaterThan(computeScore(communityHigh));
  });
});

describe('newsSignal saturation', () => {
  it('single T1 news gives ~0.36 signal', () => {
    const signal = Math.min(2.5 / 7.0, 1.0);
    expect(signal).toBeCloseTo(0.357, 2);
  });

  it('3 T1 sources saturate to 1.0', () => {
    const signal = Math.min(7.5 / 7.0, 1.0);
    expect(signal).toBe(1.0);
  });

  it('2 T2 sources give ~0.63 signal', () => {
    const signal = Math.min(4.4 / 7.0, 1.0);
    expect(signal).toBeCloseTo(0.629, 2);
  });
});
