import { describe, it, expect } from 'vitest';
import { normalizeTitle, titleHash, bigrams, jaccardSimilarity, koreanTokenize, wordJaccardSimilarity } from '../../src/services/dedup.js';

describe('normalizeTitle', () => {
  it('removes bracket expressions', () => {
    expect(normalizeTitle('[단독] 정부 발표')).toBe('정부 발표');
    expect(normalizeTitle('[속보][긴급] 대통령 담화')).toBe('대통령 담화');
    expect(normalizeTitle('[PC엔터] 손흥민 충격 고백!')).toBe('손흥민 충격 고백');
  });

  it('removes special characters', () => {
    expect(normalizeTitle('안녕하세요!!!')).toBe('안녕하세요');
    expect(normalizeTitle('주가 +5.3% 급등...')).toBe('주가 53 급등');
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeTitle('  공백   많은    제목  ')).toBe('공백 많은 제목');
  });

  it('lowercases', () => {
    expect(normalizeTitle('Breaking NEWS')).toBe('breaking news');
  });

  it('handles empty and short strings', () => {
    expect(normalizeTitle('')).toBe('');
    expect(normalizeTitle('[]')).toBe('');
    expect(normalizeTitle('안녕')).toBe('안녕');
  });
});

describe('titleHash', () => {
  it('produces consistent md5 hash', () => {
    const h1 = titleHash('[단독] 손흥민 충격 고백!');
    const h2 = titleHash('손흥민 충격 고백');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(32);
  });

  it('different titles produce different hashes', () => {
    expect(titleHash('삼성 주가 급등')).not.toBe(titleHash('삼성 주가 급락'));
  });
});

describe('bigrams', () => {
  it('generates correct bigram set for Korean text', () => {
    const b = bigrams('안녕하세요');
    expect(b).toEqual(new Set(['안녕', '녕하', '하세', '세요']));
  });

  it('returns empty set for single char', () => {
    expect(bigrams('아').size).toBe(0);
  });

  it('normalizes before generating bigrams', () => {
    const b1 = bigrams('[단독] 정부 발표');
    const b2 = bigrams('정부 발표');
    expect(b1).toEqual(b2);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    const a = new Set(['ab', 'bc', 'cd']);
    expect(jaccardSimilarity(a, a)).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    const a = new Set(['ab', 'bc']);
    const b = new Set(['xy', 'yz']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('returns correct similarity for overlapping sets', () => {
    const a = new Set(['ab', 'bc', 'cd', 'de']);
    const b = new Set(['ab', 'bc', 'cd', 'ef']);
    // intersection=3, union=5 → 0.6
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.6);
  });

  it('handles empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
    expect(jaccardSimilarity(new Set(['a']), new Set())).toBe(0);
  });

  it('similar Korean news titles score above 0.8', () => {
    const a = bigrams('정부 기준금리 동결 결정 발표');
    const b = bigrams('정부 기준금리 동결 결정');
    expect(jaccardSimilarity(a, b)).toBeGreaterThanOrEqual(0.8);
  });

  it('unrelated titles score below 0.8', () => {
    const a = bigrams('삼성전자 신제품 갤럭시 출시');
    const b = bigrams('서울 날씨 오늘 비 소식');
    expect(jaccardSimilarity(a, b)).toBeLessThan(0.8);
  });
});

describe('koreanTokenize', () => {
  it('strips particles from word endings', () => {
    const tokens = koreanTokenize('대통령은 탄핵을 발표했다');
    expect(tokens.has('대통령')).toBe(true);
    expect(tokens.has('탄핵')).toBe(true);
    // '은', '을' 조사가 제거됨
    expect(tokens.has('대통령은')).toBe(false);
    expect(tokens.has('탄핵을')).toBe(false);
  });

  it('removes stop words', () => {
    const tokens = koreanTokenize('이번 관련 삼성전자 발표');
    expect(tokens.has('삼성전자')).toBe(true);
    expect(tokens.has('발표')).toBe(true);
    expect(tokens.has('이번')).toBe(false);
    expect(tokens.has('관련')).toBe(false);
  });

  it('filters single-char tokens and pure numbers', () => {
    const tokens = koreanTokenize('삼성 3분기 실적 5조원');
    expect(tokens.has('삼성')).toBe(true);
    expect(tokens.has('실적')).toBe(true);
    // 단일 문자와 숫자 제거
    expect(tokens.has('3')).toBe(false);
    expect(tokens.has('5')).toBe(false);
  });

  it('handles bracket-containing titles after normalization', () => {
    const tokens = koreanTokenize('[속보] 대통령이 긴급 담화를 발표');
    expect(tokens.has('대통령')).toBe(true);
    expect(tokens.has('긴급')).toBe(true);
    expect(tokens.has('담화')).toBe(true);
  });

  it('returns empty set for empty string', () => {
    expect(koreanTokenize('').size).toBe(0);
  });

  it('strips longest matching particle first', () => {
    // '에서는' should match before '에' or '서'
    const tokens = koreanTokenize('학교에서는 수업을 진행');
    expect(tokens.has('학교')).toBe(true);
    expect(tokens.has('수업')).toBe(true);
  });
});

describe('wordJaccardSimilarity', () => {
  it('returns 1.0 for identical token sets', () => {
    const a = koreanTokenize('대통령 탄핵안 가결');
    expect(wordJaccardSimilarity(a, a)).toBe(1);
  });

  it('word order does not matter (unlike bigrams)', () => {
    const a = koreanTokenize('대통령 탄핵안 가결');
    const b = koreanTokenize('탄핵안 가결 대통령');
    // 단어 Jaccard는 어순 무관 → 1.0
    expect(wordJaccardSimilarity(a, b)).toBe(1);
    // 반면 bigram Jaccard는 어순에 민감
    const ba = bigrams('대통령 탄핵안 가결');
    const bb = bigrams('탄핵안 가결 대통령');
    expect(jaccardSimilarity(ba, bb)).toBeLessThan(1);
  });

  it('particle differences do not reduce similarity', () => {
    const a = koreanTokenize('삼성전자가 반도체를 발표');
    const b = koreanTokenize('삼성전자는 반도체의 발표');
    // 조사 제거 후 동일 토큰 → 높은 유사도
    expect(wordJaccardSimilarity(a, b)).toBeGreaterThanOrEqual(0.65);
  });

  it('completely different topics score low', () => {
    const a = koreanTokenize('삼성전자 반도체 실적 발표');
    const b = koreanTokenize('서울 날씨 비 예보 안내');
    expect(wordJaccardSimilarity(a, b)).toBeLessThan(0.2);
  });

  it('partially overlapping topics score medium', () => {
    const a = koreanTokenize('삼성전자 반도체 실적 발표');
    const b = koreanTokenize('현대차 실적 발표 호조');
    // '실적', '발표' 공유 → 중간 유사도
    const sim = wordJaccardSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.2);
    expect(sim).toBeLessThan(0.7);
  });

  it('handles empty sets', () => {
    expect(wordJaccardSimilarity(new Set(), new Set())).toBe(1);
    expect(wordJaccardSimilarity(new Set(['테스트']), new Set())).toBe(0);
  });
});

// ─── 이슈 클러스터링 품질 테스트 ───

describe('clustering quality — similarity thresholds', () => {
  it('unrelated issues have very low word similarity', () => {
    const tokensA = koreanTokenize('김진 논설위원 별세');
    const tokensB = koreanTokenize('이란 동경자산 해제 합의');
    const sim = wordJaccardSimilarity(tokensA, tokensB);
    expect(sim).toBeLessThan(0.15);
  });

  it('related issues with different wording have some similarity', () => {
    const tokensA = koreanTokenize('이란 동결자산 해제 협상 타결');
    const tokensB = koreanTokenize('이란 자산 해제 합의 발표');
    const sim = wordJaccardSimilarity(tokensA, tokensB);
    expect(sim).toBeGreaterThan(0); // 이란, 해제 공유
  });

  it('same-topic titles with different verbs still have word overlap', () => {
    const tokensA = koreanTokenize('트럼프 호르무즈 해협 기뢰 제거 발표');
    const tokensB = koreanTokenize('미국 호르무즈 해협 기뢰 작전 시작');
    const sim = wordJaccardSimilarity(tokensA, tokensB);
    expect(sim).toBeGreaterThan(0.2); // 호르무즈, 해협, 기뢰 공유
  });

  it('completely different topics score near zero', () => {
    const tokensA = koreanTokenize('삼성전자 반도체 실적 발표');
    const tokensB = koreanTokenize('서울 날씨 비 예보 안내');
    expect(wordJaccardSimilarity(tokensA, tokensB)).toBeLessThan(0.1);
  });
});
