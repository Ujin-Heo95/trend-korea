import { describe, it, expect } from 'vitest';
import {
  computeScore, computeScoreLegacy, getSourceWeight, getCategoryWeight,
  getCommunitySourceWeight, getCommunityHalfLife,
  getHalfLife, getNewsHalfLife, volumeDampeningFactor, type ScoreFactors,
} from '../../src/services/scoring.js';
import { normalizeTrendSignal, freshnessSignal, clusterImportanceFromVectors } from '../../src/services/scoring-helpers.js';

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
    trendSignalBonus: 1.0,
    subcategoryNorm: 1.0,
    breakingBoost: 1.0,
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

  it('all bonuses compound multiplicatively', () => {
    const factors = makeFactors({
      normalizedEngagement: 2.5,
      decay: 0.8,
      sourceWeight: 2.2,
      categoryWeight: 1.15,
      velocityBonus: 1.3,
      clusterBonus: 1.6,
    });
    const expected = 2.5 * 0.8 * 2.2 * 1.15 * 1.3 * 1.6;
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
    const newsFactors = makeFactors({
      normalizedEngagement: 3.0,
      decay: 0.75,
      sourceWeight: 2.5,
      categoryWeight: 1.20,
    });
    const communityFactors = makeFactors({
      normalizedEngagement: 3.0,
      decay: 0.75,
      sourceWeight: 1.0,
      categoryWeight: 1.08,
    });
    const newsScore = computeScore(newsFactors);
    const communityScore = computeScore(communityFactors);
    expect(newsScore).toBeGreaterThan(communityScore);
    expect(newsScore / communityScore).toBeCloseTo(2.5 * 1.2 / (1.0 * 1.08), 1);
  });

  it('decay reduces raw score absolutely over time', () => {
    const fresh = makeFactors({
      normalizedEngagement: 4.0,
      sourceWeight: 2.0,
    });
    const aged = makeFactors({
      normalizedEngagement: 4.0,
      sourceWeight: 2.0,
      decay: Math.exp(-LN2 * 240 / 240),
    });
    expect(computeScore(fresh)).toBe(8.0);
    expect(computeScore(aged)).toBeCloseTo(4.0, 1);
  });

  it('high-engagement community cannot beat T1 news by engagement alone', () => {
    const newsNormal = makeFactors({
      normalizedEngagement: 3.0,
      decay: 0.9,
      sourceWeight: 2.5,
      categoryWeight: 1.20,
    });
    const communityHigh = makeFactors({
      normalizedEngagement: 5.0,
      decay: 0.9,
      sourceWeight: 1.0,
      categoryWeight: 1.08,
    });
    expect(computeScore(newsNormal)).toBeGreaterThan(computeScore(communityHigh));
  });
});

describe('community source weights', () => {
  it('theqoo has highest community weight (1.4)', () => {
    expect(getCommunitySourceWeight('theqoo')).toBe(1.4);
  });

  it('instiz is Tier A (1.35)', () => {
    expect(getCommunitySourceWeight('instiz')).toBe(1.35);
  });

  it('dcinside is Tier B (1.15)', () => {
    expect(getCommunitySourceWeight('dcinside')).toBe(1.15);
  });

  it('clien has higher weight than default communities (1.2)', () => {
    expect(getCommunitySourceWeight('clien')).toBe(1.2);
  });

  it('etoland has lowest community weight (0.8)', () => {
    expect(getCommunitySourceWeight('etoland')).toBe(0.8);
  });

  it('unknown community source gets default 1.0', () => {
    expect(getCommunitySourceWeight('unknown_community')).toBe(1.0);
  });
});

describe('community decay half-life', () => {
  it('dcinside decays fast (120min)', () => {
    expect(getCommunityHalfLife('dcinside')).toBe(120);
  });

  it('clien decays slow (200min)', () => {
    expect(getCommunityHalfLife('clien')).toBe(200);
  });

  it('theqoo uses standard (150min)', () => {
    expect(getCommunityHalfLife('theqoo')).toBe(150);
  });

  it('unknown source gets default 150min', () => {
    expect(getCommunityHalfLife('unknown_source')).toBe(150);
  });
});

describe('new scoring factors', () => {
  it('trendSignalBonus multiplies into final score', () => {
    const base = computeScore(makeFactors());
    const boosted = computeScore(makeFactors({ trendSignalBonus: 1.5 }));
    expect(boosted).toBeCloseTo(base * 1.5, 5);
  });

  it('breakingBoost multiplies into final score', () => {
    const base = computeScore(makeFactors());
    const breaking = computeScore(makeFactors({ breakingBoost: 2.5 }));
    expect(breaking).toBeCloseTo(base * 2.5, 5);
  });

  it('subcategoryNorm multiplies into final score', () => {
    const base = computeScore(makeFactors());
    const normed = computeScore(makeFactors({ subcategoryNorm: 1.3 }));
    expect(normed).toBeCloseTo(base * 1.3, 5);
  });

  it('all new factors compound with existing factors', () => {
    const factors = makeFactors({
      normalizedEngagement: 2.0,
      sourceWeight: 2.5,
      trendSignalBonus: 1.4,
      breakingBoost: 2.0,
    });
    const expected = 2.0 * 1.0 * 2.5 * 1.0 * 1.0 * 1.0 * 1.4 * 1.0 * 2.0;
    expect(computeScore(factors)).toBeCloseTo(expected, 3);
  });
});

describe('normalizeTrendSignal', () => {
  it('raw 1.0 → 0 (no trend match)', () => {
    expect(normalizeTrendSignal(1.0)).toBe(0);
  });

  it('raw 1.8 → 10 (max trend match)', () => {
    expect(normalizeTrendSignal(1.8)).toBeCloseTo(10, 5);
  });

  it('raw 1.4 → 5 (mid-range)', () => {
    expect(normalizeTrendSignal(1.4)).toBeCloseTo(5, 5);
  });

  it('below 1.0 clamps to 0', () => {
    expect(normalizeTrendSignal(0.5)).toBe(0);
  });

  it('above 1.8 clamps to 10', () => {
    expect(normalizeTrendSignal(2.5)).toBe(10);
  });
});

describe('news signalScore (5-signal additive blend v7)', () => {
  const portalW = 0.32;
  const clusterW = 0.27;
  const trendW = 0.18;
  const engagementW = 0.13;
  const freshnessW = 0.10;

  function calcSignalScore(portal: number, cluster: number, trendRaw: number, engagement: number = 0, ageMin: number = 0): number {
    return Math.max(
      portal * portalW
      + cluster * clusterW
      + normalizeTrendSignal(trendRaw) * trendW
      + engagement * engagementW
      + freshnessSignal(ageMin) * freshnessW,
      1.0,
    );
  }

  it('weights sum to 1.0', () => {
    expect(portalW + clusterW + trendW + engagementW + freshnessW).toBeCloseTo(1.0, 5);
  });

  it('all zeros except fresh → near 1.0 (clamped)', () => {
    // ancient post: 0 for all terms → clamped to 1.0
    expect(calcSignalScore(0, 0, 1.0, 0, 10000)).toBe(1.0);
  });

  it('fresh post alone contributes via freshness term', () => {
    // age=0: freshnessSignal=10, 10*0.10=1.0 → clamped to 1.0
    expect(calcSignalScore(0, 0, 1.0, 0, 0)).toBe(1.0);
  });

  it('all signals max (fresh) → 10.0', () => {
    const score = calcSignalScore(10, 10, 1.8, 10, 0);
    // 10*0.32 + 10*0.27 + 10*0.18 + 10*0.13 + 10*0.10 = 10.0
    expect(score).toBeCloseTo(10.0, 5);
  });

  it('portal rank 1 alone (fresh) → significant score', () => {
    const score = calcSignalScore(10, 0, 1.0, 0, 0);
    // 10*0.32 + 10*0.10 = 4.2
    expect(score).toBeCloseTo(4.2, 5);
  });

  it('signalScore replaces engagement in news scoring (no outer freshness mult)', () => {
    const signalScore = calcSignalScore(8, 6, 1.4, 7, 30);
    const factors = makeFactors({
      normalizedEngagement: signalScore,
      sourceWeight: 2.2,
      decay: 0.8,
    });
    const score = computeScore(factors);
    // 외곽 freshnessBonus 곱셈 없음 — signalScore × decay × srcW 만
    expect(score).toBeCloseTo(signalScore * 2.2 * 0.8, 2);
  });
});

describe('freshnessSignal (v7 5번째 가산항)', () => {
  it('returns 10 at age 0', () => {
    expect(freshnessSignal(0)).toBeCloseTo(10, 5);
  });

  it('returns ~5.0 at one half-life (45 min)', () => {
    expect(freshnessSignal(45)).toBeCloseTo(5.0, 5);
  });

  it('returns ~6.3 at 30 min', () => {
    // 10 × exp(-ln2 × 30/45) = 10 × 2^(-0.667) ≈ 6.30
    expect(freshnessSignal(30)).toBeCloseTo(6.30, 2);
  });

  it('returns ~4.0 at 60 min', () => {
    // 10 × 2^(-60/45) ≈ 3.97
    expect(freshnessSignal(60)).toBeCloseTo(3.97, 2);
  });

  it('returns ~1.6 at 120 min', () => {
    // 10 × 2^(-120/45) ≈ 1.575
    expect(freshnessSignal(120)).toBeCloseTo(1.575, 2);
  });

  it('asymptotes to 0 for very old posts', () => {
    expect(freshnessSignal(10000)).toBeCloseTo(0, 3);
    expect(freshnessSignal(1000)).toBeGreaterThan(0);
  });

  it('is monotonically decreasing', () => {
    const samples = [0, 10, 20, 30, 60, 120, 240];
    for (let i = 1; i < samples.length; i++) {
      expect(freshnessSignal(samples[i])).toBeLessThan(freshnessSignal(samples[i - 1]));
    }
  });

  it('handles negative / non-finite age → clamps to 10', () => {
    expect(freshnessSignal(-5)).toBe(10);
    expect(freshnessSignal(NaN)).toBe(10);
  });
});

describe('clusterImportanceFromVectors (v7 entity-based)', () => {
  function randomVec(dim: number, seed: number): Float32Array {
    const v = new Float32Array(dim);
    let s = seed;
    for (let i = 0; i < dim; i++) {
      s = (s * 9301 + 49297) % 233280;
      v[i] = (s / 233280) - 0.5;
    }
    // normalize
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    for (let i = 0; i < dim; i++) v[i] /= norm;
    return v;
  }

  it('returns 0 when uniqueOutlets <= 1', () => {
    const v = randomVec(8, 1);
    expect(clusterImportanceFromVectors(1, [v, v])).toBe(0);
  });

  it('returns 0 when fewer than 2 vectors', () => {
    const v = randomVec(8, 1);
    expect(clusterImportanceFromVectors(5, [v])).toBe(0);
  });

  it('same event (identical vectors) → low importance (d_avg≈0)', () => {
    const v = randomVec(8, 1);
    // 6 outlets, all identical embedding
    const score = clusterImportanceFromVectors(6, [v, v, v, v, v, v]);
    // log2(7) ≈ 2.807, × (1 + 0×2) = 2.807
    expect(score).toBeCloseTo(Math.log2(7), 2);
  });

  it('multi-angle coverage (diverse vectors) → higher importance than same-event', () => {
    const diverse = [1, 2, 3, 4, 5, 6].map(i => randomVec(32, i * 1000));
    const sameV = randomVec(32, 1);
    const sameEvent = [sameV, sameV, sameV, sameV, sameV, sameV];

    const diverseScore = clusterImportanceFromVectors(6, diverse);
    const sameScore = clusterImportanceFromVectors(6, sameEvent);

    expect(diverseScore).toBeGreaterThan(sameScore);
  });

  it('clamps to 10 maximum', () => {
    const diverse = Array.from({ length: 20 }, (_, i) => randomVec(32, i * 777));
    const score = clusterImportanceFromVectors(20, diverse);
    expect(score).toBeLessThanOrEqual(10);
    expect(score).toBeGreaterThan(0);
  });

  it('monotonic in uniqueOutlets for identical vectors', () => {
    const v = randomVec(8, 42);
    const s2 = clusterImportanceFromVectors(2, [v, v]);
    const s4 = clusterImportanceFromVectors(4, [v, v, v, v]);
    const s8 = clusterImportanceFromVectors(8, [v, v, v, v, v, v, v, v]);
    expect(s4).toBeGreaterThan(s2);
    expect(s8).toBeGreaterThan(s4);
  });
});

describe('news source-specific decay (getNewsHalfLife)', () => {
  it('wire services decay faster (180min)', () => {
    expect(getNewsHalfLife('yna')).toBe(180);
    expect(getNewsHalfLife('newsis')).toBe(180);
  });

  it('broadcast standard (240min)', () => {
    expect(getNewsHalfLife('sbs')).toBe(240);
    expect(getNewsHalfLife('kbs')).toBe(240);
  });

  it('dailies decay slower (300min)', () => {
    expect(getNewsHalfLife('chosun')).toBe(300);
    expect(getNewsHalfLife('khan')).toBe(300);
  });

  it('business press slowest (320min)', () => {
    expect(getNewsHalfLife('mk')).toBe(320);
    expect(getNewsHalfLife('hankyung')).toBe(320);
  });

  it('portal aggregators fast (200min)', () => {
    expect(getNewsHalfLife('daum_news')).toBe(200);
    expect(getNewsHalfLife('nate_news')).toBe(200);
  });

  it('unknown news source gets default 240min', () => {
    expect(getNewsHalfLife('unknown_news')).toBe(240);
  });
});
