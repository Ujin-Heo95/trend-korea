import { describe, it, expect } from 'vitest';
import {
  isDiscriminativeToken,
  makeShareHighIdfGate,
  TOKEN_STATS_TUNABLES,
  type TokenStatsSnapshot,
} from '../../src/services/tokenStats.js';

function snap(opts: {
  tokens: Record<string, { df24: number; dfBaseline: number }>;
  n24: number;
  nBase: number;
}): TokenStatsSnapshot {
  return {
    stats: new Map(Object.entries(opts.tokens)),
    docCount24h: opts.n24,
    docCountBaseline: opts.nBase,
    computedAt: new Date(),
  };
}

describe('isDiscriminativeToken', () => {
  it('cold-start (empty snapshot) → 항상 true', () => {
    const empty = snap({ tokens: {}, n24: 0, nBase: 0 });
    expect(isDiscriminativeToken('아파트', empty)).toBe(true);
    expect(isDiscriminativeToken('한동훈', empty)).toBe(true);
  });

  it('unknown token (snapshot 에 없음) → true', () => {
    const s = snap({
      tokens: { 아파트: { df24: 80, dfBaseline: 700 } },
      n24: 1000,
      nBase: 10000,
    });
    expect(isDiscriminativeToken('처음보는단어', s)).toBe(true);
  });

  it('rate_24h < 1% (희소) → true', () => {
    // 5/1000 = 0.5% < 1%
    const s = snap({
      tokens: { 강남: { df24: 5, dfBaseline: 50 } },
      n24: 1000,
      nBase: 10000,
    });
    expect(isDiscriminativeToken('강남', s)).toBe(true);
  });

  it('rate_24h ≥ 1% 이면서 burst < 2 → false (만성 일반어)', () => {
    // rate24 = 80/1000 = 8%, rateBase = 700/10000 = 7%, burst ≈ 1.14
    const s = snap({
      tokens: { 아파트: { df24: 80, dfBaseline: 700 } },
      n24: 1000,
      nBase: 10000,
    });
    expect(isDiscriminativeToken('아파트', s)).toBe(false);
  });

  it('burst ≥ 2 → true (평소 흔한데 폭증)', () => {
    // rate24 = 100/1000 = 10%, rateBase = 200/10000 = 2%, burst = 5
    const s = snap({
      tokens: { 집값: { df24: 100, dfBaseline: 200 } },
      n24: 1000,
      nBase: 10000,
    });
    expect(isDiscriminativeToken('집값', s)).toBe(true);
  });

  it('튜닝값 노출', () => {
    expect(TOKEN_STATS_TUNABLES.DF_RATE_DISCRIMINATIVE).toBe(0.01);
    expect(TOKEN_STATS_TUNABLES.BURST_RATIO_DISCRIMINATIVE).toBe(2.0);
  });
});

describe('makeShareHighIdfGate', () => {
  it('cold start → 모든 페어 통과 (기존 동작 보존)', () => {
    const empty = snap({ tokens: {}, n24: 0, nBase: 0 });
    const gate = makeShareHighIdfGate(empty);
    expect(gate('강남 아파트 화재', '전세 아파트 시세 급등')).toBe(true);
  });

  it('일반명사 "아파트" 만 공유하는 두 제목 → 차단', () => {
    // 아파트: 만성 일반어 (rate 8%, burst ~1)
    // 강남, 화재, 전세, 시세, 급등: 모두 unknown → discriminative
    // 두 제목의 교집합: 오직 "아파트" 만 → 차단되어야 함
    const s = snap({
      tokens: { 아파트: { df24: 80, dfBaseline: 700 } },
      n24: 1000,
      nBase: 10000,
    });
    const gate = makeShareHighIdfGate(s);
    expect(gate('강남 아파트 화재', '전세 아파트 시세')).toBe(false);
  });

  it('discriminative 토큰 ("강남") 을 공유하면 통과', () => {
    const s = snap({
      tokens: {
        아파트: { df24: 80, dfBaseline: 700 },
        강남: { df24: 5, dfBaseline: 50 },
      },
      n24: 1000,
      nBase: 10000,
    });
    const gate = makeShareHighIdfGate(s);
    expect(gate('강남 아파트 화재', '강남 아파트 시세')).toBe(true);
  });

  it('교집합 자체가 비었으면 차단', () => {
    const s = snap({
      tokens: { 아파트: { df24: 80, dfBaseline: 700 } },
      n24: 1000,
      nBase: 10000,
    });
    const gate = makeShareHighIdfGate(s);
    expect(gate('강남 화재 발생', '부산 침수 피해')).toBe(false);
  });

  it('한쪽이 토큰화 결과 0 (특수문자만) → 통과 (판단 불가, 코사인에 위임)', () => {
    const s = snap({
      tokens: { 아파트: { df24: 80, dfBaseline: 700 } },
      n24: 1000,
      nBase: 10000,
    });
    const gate = makeShareHighIdfGate(s);
    expect(gate('!!!', '강남 아파트 화재')).toBe(true);
  });

  it('burst 중인 일반명사 ("집값") 은 게이트 통과', () => {
    const s = snap({
      tokens: { 집값: { df24: 100, dfBaseline: 200 } }, // burst 5
      n24: 1000,
      nBase: 10000,
    });
    const gate = makeShareHighIdfGate(s);
    expect(gate('서울 집값 폭등', '강북 집값 급등')).toBe(true);
  });
});
