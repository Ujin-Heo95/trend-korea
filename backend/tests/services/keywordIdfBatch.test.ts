import { describe, it, expect } from 'vitest';
import { computeIdfMap } from '../../src/services/keywordIdfBatch.js';
import { normalizeTitle } from '../../src/services/dedup.js';

function corpus(...titles: string[]): string[] {
  return titles.map(normalizeTitle);
}

describe('computeIdfMap', () => {
  it('assigns higher idf to rare keywords than to broad keywords', () => {
    // 광범위 키워드 "정부"는 거의 모든 문서에 등장 → idf 낮음
    // 희귀 키워드 "탄핵재의결"은 1개 문서에만 → idf 높음
    const docs = corpus(
      '정부 발표 새 정책',
      '정부 부동산 대책 공개',
      '정부 인사 발령 명단',
      '정부 외교 회담 개최',
      '윤석열 탄핵재의결 가결',
    );
    const result = computeIdfMap(docs, ['정부', '탄핵재의결']);
    const broad = result.get('정부')!;
    const rare = result.get('탄핵재의결')!;

    expect(broad.df).toBe(4);
    expect(rare.df).toBe(1);
    expect(rare.idf).toBeGreaterThan(broad.idf);
  });

  it('uses smoothing so idf is always positive even when df === N', () => {
    const docs = corpus('한국 사회', '한국 경제', '한국 정치');
    const result = computeIdfMap(docs, ['한국']);
    const stats = result.get('한국')!;
    expect(stats.df).toBe(3);
    expect(stats.idf).toBeGreaterThan(0);
  });

  it('returns idf > 1 for keywords absent from corpus', () => {
    const docs = corpus('아무 관련 없는 제목');
    const result = computeIdfMap(docs, ['비트코인']);
    const stats = result.get('비트코인')!;
    expect(stats.df).toBe(0);
    // idf = ln((1+1)/(0+1)) + 1 = ln(2) + 1 ≈ 1.69
    expect(stats.idf).toBeGreaterThan(1);
  });

  it('matches whitespace-stripped form for compound keywords (≥4 chars)', () => {
    // "부동산 시장" 키워드가 "부동산시장이 흔들린다" 제목에도 매칭되어야 함
    const docs = corpus('부동산시장이 흔들린다');
    const result = computeIdfMap(docs, ['부동산 시장']);
    expect(result.get('부동산 시장')!.df).toBe(1);
  });

  it('deduplicates keyword input', () => {
    const docs = corpus('테스트 문서');
    const result = computeIdfMap(docs, ['테스트', '테스트', '테스트']);
    expect(result.size).toBe(1);
  });

  it('returns empty map when no keywords supplied', () => {
    const result = computeIdfMap(corpus('문서'), []);
    expect(result.size).toBe(0);
  });

  it('orders idf consistently: rare > medium > broad', () => {
    const docs = corpus(
      '정부 정책 발표',
      '정부 인사 발령',
      '정부 회담 개최',
      '정부 부동산 대책',
      '경제 회복 신호 부동산',
      '윤석열 탄핵 표결',
    );
    const result = computeIdfMap(docs, ['정부', '부동산', '탄핵']);
    const broad = result.get('정부')!.idf;
    const medium = result.get('부동산')!.idf;
    const rare = result.get('탄핵')!.idf;
    expect(broad).toBeLessThan(medium);
    expect(medium).toBeLessThan(rare);
  });
});
