import { describe, it, expect } from 'vitest';
import { normalizeTitle, titleHash, bigrams, jaccardSimilarity } from '../../src/services/dedup.js';

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
