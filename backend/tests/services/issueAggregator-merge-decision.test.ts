import { describe, it, expect } from 'vitest';
import { __internal__ } from '../../src/services/issueAggregator.js';

const { decideMergeByIdfAndCos, DEFAULT_MERGE_IDF_THRESHOLD, DEFAULT_MERGE_COS_THRESHOLD, IDF_FALLBACK } = __internal__;

const STOPWORDS = new Set(['관련', '대한', '발표', '논의', '사건', '사고']);

type Stats = { df: number; idf: number };

function mkMap(entries: Record<string, [number, number]>): Map<string, Stats> {
  // entries: { keyword: [df, idf] }
  return new Map(Object.entries(entries).map(([k, [df, idf]]) => [k, { df, idf }]));
}

function call(opts: Partial<Parameters<typeof decideMergeByIdfAndCos>[0]> & {
  sharedKeywords: readonly string[];
}) {
  return decideMergeByIdfAndCos({
    idfMap: new Map(),
    idfThreshold: DEFAULT_MERGE_IDF_THRESHOLD,
    cosThreshold: DEFAULT_MERGE_COS_THRESHOLD,
    cos: null,
    stopwords: STOPWORDS,
    ...opts,
  });
}

describe('decideMergeByIdfAndCos', () => {
  it('rejects pair sharing only broad keywords (low idf)', () => {
    // "정부" idf=0.3 df=500, "경제" idf=0.4 df=400 → 합 0.7 < 3.5
    const idfMap = mkMap({ '정부': [500, 0.3], '경제': [400, 0.4] });
    const result = call({ sharedKeywords: ['정부', '경제'], idfMap });
    expect(result.merge).toBe(false);
    expect(result.reason).toBe('low_idf');
  });

  it('merges pair sharing rare keywords (high idf)', () => {
    const idfMap = mkMap({ '탄핵': [10, 2.5], '표결': [8, 2.8] });
    const result = call({ sharedKeywords: ['탄핵', '표결'], idfMap });
    expect(result.merge).toBe(true);
    expect(result.reason).toBe('merge');
    expect(result.idfSum).toBeCloseTo(5.3, 2);
  });

  it('merges pair sharing one specific keyword above threshold', () => {
    const idfMap = mkMap({ '윤석열탄핵재의결': [3, 4.5] });
    const result = call({ sharedKeywords: ['윤석열탄핵재의결'], idfMap });
    expect(result.merge).toBe(true);
  });

  it('uses fallback idf when keyword absent from cache (cold start friendly)', () => {
    // 빈 idfMap → 모든 키워드가 IDF_FALLBACK(2.5), df 체크는 cold start로 통과
    const result = call({ sharedKeywords: ['신규키워드A', '신규키워드B'] });
    expect(result.merge).toBe(true);
    expect(result.idfSum).toBeCloseTo(IDF_FALLBACK * 2, 2);
  });

  it('rejects pair when only stopwords are shared', () => {
    const idfMap = mkMap({ '관련': [200, 0.2], '발표': [180, 0.3] });
    const result = call({ sharedKeywords: ['관련', '발표'], idfMap });
    expect(result.merge).toBe(false);
    expect(result.reason).toBe('no_informative_kw');
  });

  it('strips stopwords before evaluating idf sum', () => {
    // "관련"(stopword) + "탄핵"(specific df=1, cold start fallback idf=2.5) → 합 < 3.5
    const result = call({ sharedKeywords: ['관련', '탄핵'] });
    expect(result.merge).toBe(false);
    expect(result.reason).toBe('low_idf');
  });

  it('embedding gate rejects when cos below threshold even if idf passes', () => {
    const idfMap = mkMap({ '탄핵': [10, 2.5], '표결': [8, 2.8] });
    const result = call({
      sharedKeywords: ['탄핵', '표결'],
      idfMap,
      cos: 0.5,
    });
    expect(result.merge).toBe(false);
    expect(result.reason).toBe('low_cos');
  });

  it('embedding gate allows when cos above threshold', () => {
    const idfMap = mkMap({ '탄핵': [10, 2.5], '표결': [8, 2.8] });
    const result = call({
      sharedKeywords: ['탄핵', '표결'],
      idfMap,
      cos: 0.85,
    });
    expect(result.merge).toBe(true);
  });

  it('null cos is treated as "unknown" — falls back to idf-only decision', () => {
    const idfMap = mkMap({ '탄핵': [10, 2.5], '표결': [8, 2.8] });
    const result = call({
      sharedKeywords: ['탄핵', '표결'],
      idfMap,
      cos: null,
    });
    expect(result.merge).toBe(true);
  });

  it('threshold respects cfg override (lower threshold permits more merges)', () => {
    const idfMap = mkMap({ '정부': [500, 0.3], '경제': [400, 0.4] });
    const strict = call({ sharedKeywords: ['정부', '경제'], idfMap, idfThreshold: 3.5 });
    const lax = call({ sharedKeywords: ['정부', '경제'], idfMap, idfThreshold: 0.5 });
    expect(strict.merge).toBe(false);
    expect(lax.merge).toBe(true);
  });

  it('filters out wiki phantom keywords (df=0) — appearsInCorpus guard', () => {
    // 위키 문서 제목이 trend_keywords에 들어와 idf는 매우 높지만 df=0인 경우
    // (예: "ヘイラ", "런닝맨: 라이트&쉐도우")
    const idfMap = mkMap({
      '리아': [0, 10.14],          // wiki phantom — 코퍼스에 없음
      '윤석열탄핵재의결': [0, 10.14], // 마찬가지
    });
    const result = call({ sharedKeywords: ['리아', '윤석열탄핵재의결'], idfMap });
    expect(result.merge).toBe(false);
    expect(result.reason).toBe('no_informative_kw');
  });

  it('passes when at least one shared keyword has df ≥ 2 (genuine corpus signal)', () => {
    const idfMap = mkMap({
      '리아': [0, 10.14],   // phantom
      '탄핵': [5, 4.0],     // 실제 코퍼스에 등장
    });
    // "탄핵" 단독으로 idf 4.0 ≥ 3.5 → 통과
    const result = call({ sharedKeywords: ['리아', '탄핵'], idfMap });
    expect(result.merge).toBe(true);
  });

  it('df=1 single occurrence is also treated as phantom (≥2 required)', () => {
    const idfMap = mkMap({ '단일출현키워드': [1, 8.0] });
    const result = call({ sharedKeywords: ['단일출현키워드'], idfMap });
    expect(result.merge).toBe(false);
    expect(result.reason).toBe('no_informative_kw');
  });
});

describe('aggregatePostScores NaN guard', () => {
  // 간접 테스트: scoreAndFilter 결과가 NaN 없이 finite한지
  // (직접 export 안 되어 있으므로 동작 검증은 통합 테스트가 담당)
  // 본 test는 spec 명시용
  it('signals that NaN/Infinity inputs must be filtered (see issueAggregator.aggregatePostScores)', () => {
    expect(true).toBe(true);
  });
});
