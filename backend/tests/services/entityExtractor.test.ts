import { describe, it, expect } from 'vitest';
import { extractEntities, entityIntersection } from '../../src/services/entityExtractor.js';

describe('extractEntities', () => {
  it('extracts known person names', () => {
    const e = extractEntities('김민재 풀타임 뮌헨 5-0 승리');
    expect(e.has('김민재')).toBe(true);
    expect(e.has('뮌헨')).toBe(true);
    expect(e.has('5-0')).toBe(true);
  });

  it('extracts Korean name by surname pattern', () => {
    const e = extractEntities('박지성 은퇴 10주년 인터뷰');
    expect(e.has('박지성')).toBe(true);
  });

  it('rejects general nouns even with brackets', () => {
    const e = extractEntities('[속보] 정부 경제 발표');
    expect(e.has('정부')).toBe(false);
    expect(e.has('경제')).toBe(false);
    expect(e.has('속보')).toBe(false);
    expect(e.has('발표')).toBe(false);
  });

  it('extracts known orgs', () => {
    const e = extractEntities('삼성전자 3분기 영업이익 발표');
    expect(e.has('삼성전자')).toBe(true);
  });

  it('extracts English proper nouns', () => {
    const e = extractEntities('Apple 신제품 공개, Tim Cook 발표');
    expect(e.has('apple')).toBe(true);
    expect(e.has('tim')).toBe(false); // 3자 미만 제외
    expect(e.has('cook')).toBe(true);
  });

  it('extracts numeric signals', () => {
    const e = extractEntities('한국 일본에 3-2 승리, 28세 손흥민 골');
    expect(e.has('3-2')).toBe(true);
    expect(e.has('28세')).toBe(true);
    expect(e.has('손흥민')).toBe(true);
  });

  it('strips particles from name tokens', () => {
    const e = extractEntities('이재명이 발표한 정책');
    expect(e.has('이재명')).toBe(true);
  });

  it('returns empty set for abstract titles', () => {
    const e = extractEntities('오늘의 경제 전망');
    expect(e.size).toBe(0);
  });

  it('handles empty input', () => {
    expect(extractEntities('').size).toBe(0);
  });

  it('case 1: 김민재 vs 황선홍 should NOT share entities', () => {
    const a = extractEntities('김민재 풀타임 뮌헨 5-0');
    const b = extractEntities('황선홍 인터뷰 한국 축구 미래');
    expect(entityIntersection(a, b)).toBe(0);
  });

  it('case 2: same 삼성전자 stories SHOULD share entities', () => {
    const a = extractEntities('삼성전자 3분기 영업익 발표');
    const b = extractEntities('삼성전자 신제품 공개');
    expect(entityIntersection(a, b)).toBeGreaterThan(0);
  });
});

describe('entityIntersection', () => {
  it('returns 0 for empty sets', () => {
    expect(entityIntersection(new Set(), new Set(['a']))).toBe(0);
  });
  it('counts shared elements', () => {
    expect(entityIntersection(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBe(2);
  });
});
