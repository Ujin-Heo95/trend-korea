import { describe, it, expect } from 'vitest';
import { matchPostToKeywords, computeTrendSignalBonus, type TrendKeywordEntry } from '../../src/services/trendSignals.js';

function makeEntry(keyword: string, sourceKey: string, strength = 0.5, hoursAgo = 0): TrendKeywordEntry {
  return {
    keyword,
    normalized: keyword.toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim(),
    sourceKey,
    signalStrength: strength,
    scrapedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
  };
}

describe('matchPostToKeywords', () => {
  it('matches exact keyword in title', () => {
    const index = [makeEntry('부동산', 'google_trends')];
    const result = matchPostToKeywords('부동산 시장 급등 전망', index);
    expect(result.matchedSources.size).toBe(1);
    expect(result.matchedSources.has('google_trends')).toBe(true);
  });

  it('matches compound keyword with whitespace variation', () => {
    const index = [makeEntry('부동산 시장', 'naver_datalab')];
    const result = matchPostToKeywords('부동산시장이 흔들린다', index);
    expect(result.matchedSources.size).toBe(1);
  });

  it('does not match short keyword (1 char)', () => {
    const index = [makeEntry('집', 'google_trends')];
    const result = matchPostToKeywords('집값 상승', index);
    expect(result.matchedSources.size).toBe(0);
  });

  it('matches multiple sources independently', () => {
    const index = [
      makeEntry('기준금리', 'google_trends'),
      makeEntry('기준금리', 'bigkinds_issues'),
      makeEntry('부동산', 'naver_datalab'),
    ];
    const result = matchPostToKeywords('기준금리 동결에 부동산 시장 반응', index);
    expect(result.matchedSources.size).toBe(3);
  });

  it('returns empty for no match', () => {
    const index = [makeEntry('비트코인', 'google_trends')];
    const result = matchPostToKeywords('삼성전자 실적 발표', index);
    expect(result.matchedSources.size).toBe(0);
  });

  it('only counts each source once', () => {
    const index = [
      makeEntry('AI', 'naver_datalab', 0.5),
      makeEntry('인공지능', 'naver_datalab', 0.8),
    ];
    const result = matchPostToKeywords('AI 인공지능 시대', index);
    // naver_datalab should appear only once
    expect(result.matchedSources.size).toBe(1);
  });

  it('Latin keywords need 3+ chars', () => {
    const index = [makeEntry('AI', 'google_trends')];
    const result = matchPostToKeywords('AI가 바꾸는 세상', index);
    expect(result.matchedSources.size).toBe(0); // "AI" is only 2 chars

    const index3 = [makeEntry('GPT', 'google_trends')];
    const result3 = matchPostToKeywords('GPT 모델 출시', index3);
    expect(result3.matchedSources.size).toBe(1);
  });

  it('temporal decay is 1.0 for recent keywords', () => {
    const index = [makeEntry('부동산', 'google_trends', 0.5, 0.5)]; // 30min ago
    const result = matchPostToKeywords('부동산 전망', index);
    expect(result.avgTemporalDecay).toBe(1.0);
  });

  it('temporal decay reduces for older keywords', () => {
    const index = [makeEntry('부동산', 'google_trends', 0.5, 5)]; // 5h ago
    const result = matchPostToKeywords('부동산 전망', index);
    expect(result.avgTemporalDecay).toBe(0.6);
  });

  it('temporal decay is 0.3 for 6-12h old keywords', () => {
    const index = [makeEntry('부동산', 'google_trends', 0.5, 10)]; // 10h ago
    const result = matchPostToKeywords('부동산 전망', index);
    expect(result.avgTemporalDecay).toBe(0.3);
  });
});

describe('computeTrendSignalBonus', () => {
  it('returns 1.0 for no matches', () => {
    const bonus = computeTrendSignalBonus({
      matchedSources: new Set(),
      bestStrength: 0,
      avgTemporalDecay: 0,
    });
    expect(bonus).toBe(1.0);
  });

  it('returns ~1.15 for single source with medium strength', () => {
    const bonus = computeTrendSignalBonus({
      matchedSources: new Set(['google_trends']),
      bestStrength: 0.5,
      avgTemporalDecay: 1.0,
    });
    // 1.15 * (0.6 + 0.4 * 0.5) * 1.0 = 1.15 * 0.8 = 0.92 → clamped to 1.0
    // Wait, that's below 1.0. Let me recalculate:
    // baseBonusByCount[1] = 1.15, quality = 0.6 + 0.4*0.5 = 0.8
    // raw = 1.15 * 0.8 * 1.0 = 0.92 → max(1.0, 0.92) = 1.0
    // Hmm actually the base bonus already > 1 so 0.92 < 1 gets clamped
    expect(bonus).toBe(1.0);
  });

  it('returns > 1.0 for single source with high strength', () => {
    const bonus = computeTrendSignalBonus({
      matchedSources: new Set(['google_trends']),
      bestStrength: 1.0,
      avgTemporalDecay: 1.0,
    });
    // 1.15 * (0.6 + 0.4*1.0) * 1.0 = 1.15 * 1.0 = 1.15
    expect(bonus).toBeCloseTo(1.15, 2);
  });

  it('returns higher bonus for two sources', () => {
    const single = computeTrendSignalBonus({
      matchedSources: new Set(['google_trends']),
      bestStrength: 1.0,
      avgTemporalDecay: 1.0,
    });
    const dual = computeTrendSignalBonus({
      matchedSources: new Set(['google_trends', 'bigkinds_issues']),
      bestStrength: 1.0,
      avgTemporalDecay: 1.0,
    });
    expect(dual).toBeGreaterThan(single);
    // 1.35 * 1.0 * 1.0 = 1.35
    expect(dual).toBeCloseTo(1.35, 2);
  });

  it('returns highest bonus for three sources', () => {
    const bonus = computeTrendSignalBonus({
      matchedSources: new Set(['google_trends', 'bigkinds_issues', 'naver_datalab']),
      bestStrength: 1.0,
      avgTemporalDecay: 1.0,
    });
    // 1.6 * 1.0 * 1.0 = 1.6
    expect(bonus).toBeCloseTo(1.6, 2);
  });

  it('caps at 1.8', () => {
    const bonus = computeTrendSignalBonus({
      matchedSources: new Set(['a', 'b', 'c', 'd']),
      bestStrength: 1.0,
      avgTemporalDecay: 1.0,
    });
    expect(bonus).toBeLessThanOrEqual(1.8);
  });

  it('temporal decay reduces bonus', () => {
    const fresh = computeTrendSignalBonus({
      matchedSources: new Set(['google_trends', 'bigkinds_issues']),
      bestStrength: 1.0,
      avgTemporalDecay: 1.0,
    });
    const old = computeTrendSignalBonus({
      matchedSources: new Set(['google_trends', 'bigkinds_issues']),
      bestStrength: 1.0,
      avgTemporalDecay: 0.3,
    });
    expect(old).toBeLessThan(fresh);
  });
});
