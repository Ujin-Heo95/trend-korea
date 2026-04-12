import { describe, it, expect } from 'vitest';
import { labelTopics, tokenize, jaccard } from '../../src/services/topicLabeler.js';

describe('tokenize', () => {
  it('strips Korean particles', () => {
    const t = tokenize('윤석열이 탄핵을 발의했다');
    expect(t.has('윤석열')).toBe(true);
    expect(t.has('탄핵')).toBe(true);
  });

  it('removes stop words', () => {
    const t = tokenize('대한민국 관련 발표');
    expect(t.has('관련')).toBe(false);
  });

  it('strips brackets and special chars', () => {
    const t = tokenize('[속보] 윤석열, 탄핵 발의!');
    expect(t.has('윤석열')).toBe(true);
    expect(t.has('탄핵')).toBe(true);
    expect(t.has('속보')).toBe(false);
  });
});

describe('jaccard', () => {
  it('returns 1 for both empty', () => {
    expect(jaccard(new Set(), new Set())).toBe(1);
  });
  it('returns 0 for one empty', () => {
    expect(jaccard(new Set(['a']), new Set())).toBe(0);
  });
  it('computes intersection over union', () => {
    expect(jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBeCloseTo(2 / 4, 5);
  });
});

describe('labelTopics', () => {
  it('returns 1 label for cohesive same-event titles', () => {
    const titles = [
      '윤석열 대통령 탄핵 가결 표결',
      '윤석열 대통령 탄핵안 표결 가결',
      '윤석열 대통령 탄핵 발의 통과',
    ];
    const r = labelTopics(titles);
    expect(r.labelCount).toBe(1);
    expect(r.largestLabelRatio).toBe(1);
    expect(r.crossTopicPairs).toBe(0);
  });

  it('detects cross-topic in football cluster (real failure case)', () => {
    // 오늘 세션에서 cluster 8993이 묶었던 무관 축구 제목들
    const titles = [
      '김민재 풀타임 뮌헨 5대 0 대승',
      '안정환 유튜브 수익 전액 기부',
      '한국 여자축구 브라질에 1-5 대패',
      '혼다 게이스케 싱가포르 FC 주롱과 계약',
      '황선홍 감독 머리 아파 안톤은 회복',
    ];
    const r = labelTopics(titles);
    // 5개 모두 다른 사건 → 라벨 5개
    expect(r.labelCount).toBeGreaterThanOrEqual(4);
    expect(r.crossTopicPairs).toBeGreaterThan(5);
  });

  it('returns single label for one title', () => {
    const r = labelTopics(['윤석열 탄핵']);
    expect(r.labelCount).toBe(1);
    expect(r.largestLabelRatio).toBe(1);
    expect(r.crossTopicPairs).toBe(0);
  });

  it('returns empty for no titles', () => {
    const r = labelTopics([]);
    expect(r.labelCount).toBe(0);
    expect(r.titleCount).toBe(0);
  });

  it('mixed cluster: 3 cohesive + 2 outliers', () => {
    const titles = [
      '윤석열 대통령 탄핵 가결',
      '윤석열 대통령 탄핵 표결',
      '윤석열 대통령 탄핵 통과',
      '오월드 늑대 수색',
      '삼성전자 가전 양판점 부진',
    ];
    const r = labelTopics(titles);
    expect(r.labelCount).toBe(3); // 탄핵(3) + 늑대(1) + 양판점(1)
    expect(r.largestLabelRatio).toBeCloseTo(3 / 5, 5);
    // 응집 3개 라벨 A(3) + B(1) + C(1)의 cross pair = C(3,1)+C(3,1)+C(1,1) = 3+3+1 = 7
    expect(r.crossTopicPairs).toBe(7);
  });

  it('largestLabelRatio detects dominance', () => {
    // 9 응집 + 1 outlier
    const titles = [
      ...Array(9).fill('윤석열 탄핵 가결 표결'),
      '아무 관련 없는 다른 제목입니다',
    ];
    const r = labelTopics(titles);
    expect(r.largestLabelRatio).toBeCloseTo(0.9, 5);
  });
});
