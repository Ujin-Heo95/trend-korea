import { describe, it, expect } from 'vitest';
import { __internal__ } from '../../src/services/issueAggregator.js';

const { decideMergeByIdfAndCos, DEFAULT_MERGE_IDF_THRESHOLD, DEFAULT_MERGE_COS_THRESHOLD, IDF_FALLBACK } = __internal__;

const STOPWORDS = new Set(['관련', '대한', '발표', '논의', '사건', '사고']);

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
    // "정부" idf=0.3, "경제" idf=0.4 → 합 0.7 < 3.5
    const idfMap = new Map([['정부', 0.3], ['경제', 0.4]]);
    const result = call({ sharedKeywords: ['정부', '경제'], idfMap });
    expect(result.merge).toBe(false);
    expect(result.reason).toBe('low_idf');
  });

  it('merges pair sharing rare keywords (high idf)', () => {
    const idfMap = new Map([['탄핵', 2.5], ['표결', 2.8]]);
    const result = call({ sharedKeywords: ['탄핵', '표결'], idfMap });
    expect(result.merge).toBe(true);
    expect(result.reason).toBe('merge');
    expect(result.idfSum).toBeCloseTo(5.3, 2);
  });

  it('merges pair sharing one specific keyword above threshold', () => {
    // 단일 고유 키워드도 idf가 임계값 넘으면 통과
    const idfMap = new Map([['윤석열탄핵재의결', 4.5]]);
    const result = call({ sharedKeywords: ['윤석열탄핵재의결'], idfMap });
    expect(result.merge).toBe(true);
  });

  it('uses fallback idf when keyword absent from cache (cold start friendly)', () => {
    // 빈 idfMap → 모든 키워드가 IDF_FALLBACK(2.5)
    // 2개 공유 → 합 5.0 ≥ 3.5 → 병합
    const result = call({ sharedKeywords: ['신규키워드A', '신규키워드B'] });
    expect(result.merge).toBe(true);
    expect(result.idfSum).toBeCloseTo(IDF_FALLBACK * 2, 2);
  });

  it('rejects pair when only stopwords are shared', () => {
    const idfMap = new Map([['관련', 0.2], ['발표', 0.3]]);
    const result = call({ sharedKeywords: ['관련', '발표'], idfMap });
    expect(result.merge).toBe(false);
    expect(result.reason).toBe('no_informative_kw');
  });

  it('strips stopwords before evaluating idf sum', () => {
    // "관련"(stopword) + "탄핵"(specific) → informative=["탄핵"], idf=2.5(fallback) < 3.5 → 거부
    const result = call({ sharedKeywords: ['관련', '탄핵'] });
    expect(result.merge).toBe(false);
    expect(result.reason).toBe('low_idf');
  });

  it('embedding gate rejects when cos below threshold even if idf passes', () => {
    const idfMap = new Map([['탄핵', 2.5], ['표결', 2.8]]);
    const result = call({
      sharedKeywords: ['탄핵', '표결'],
      idfMap,
      cos: 0.5, // 의미적으로 멀음
    });
    expect(result.merge).toBe(false);
    expect(result.reason).toBe('low_cos');
  });

  it('embedding gate allows when cos above threshold', () => {
    const idfMap = new Map([['탄핵', 2.5], ['표결', 2.8]]);
    const result = call({
      sharedKeywords: ['탄핵', '표결'],
      idfMap,
      cos: 0.85,
    });
    expect(result.merge).toBe(true);
  });

  it('null cos is treated as "unknown" — falls back to idf-only decision', () => {
    // 콜드스타트 friendly: 임베딩이 아직 생성 안된 신규 포스트 보호
    const idfMap = new Map([['탄핵', 2.5], ['표결', 2.8]]);
    const result = call({
      sharedKeywords: ['탄핵', '표결'],
      idfMap,
      cos: null,
    });
    expect(result.merge).toBe(true);
  });

  it('threshold respects cfg override (lower threshold permits more merges)', () => {
    const idfMap = new Map([['정부', 0.3], ['경제', 0.4]]);
    const strict = call({ sharedKeywords: ['정부', '경제'], idfMap, idfThreshold: 3.5 });
    const lax = call({ sharedKeywords: ['정부', '경제'], idfMap, idfThreshold: 0.5 });
    expect(strict.merge).toBe(false);
    expect(lax.merge).toBe(true);
  });
});
