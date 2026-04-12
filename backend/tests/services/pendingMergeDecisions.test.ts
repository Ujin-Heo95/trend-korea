import { describe, it, expect } from 'vitest';
import { computePairHash } from '../../src/services/pendingMergeDecisions.js';

describe('computePairHash', () => {
  it('is stable regardless of argument order', () => {
    const h1 = computePairHash('김민재 뮌헨 복귀', '황선홍 사임');
    const h2 = computePairHash('황선홍 사임', '김민재 뮌헨 복귀');
    expect(h1).toBe(h2);
  });

  it('produces distinct hashes for different pairs', () => {
    const h1 = computePairHash('A', 'B');
    const h2 = computePairHash('A', 'C');
    expect(h1).not.toBe(h2);
  });

  it('returns 32-char hex (md5)', () => {
    const h = computePairHash('제목1', '제목2');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });
});
