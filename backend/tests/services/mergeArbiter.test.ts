import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @google/generative-ai before importing the module under test
const generateContentMock = vi.fn();
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContent: generateContentMock }),
  })),
  SchemaType: { OBJECT: 'object', BOOLEAN: 'boolean' },
}));

vi.mock('../../src/config/index.js', () => ({
  config: { geminiApiKey: 'test-key' },
}));

import {
  arbitrateMerge,
  resetArbiterBatchState,
  getArbiterStats,
  __internal__,
} from '../../src/services/mergeArbiter.js';

function mockYes(): void {
  generateContentMock.mockResolvedValueOnce({
    response: { text: () => '{"same_event": true}' },
  });
}
function mockNo(): void {
  generateContentMock.mockResolvedValueOnce({
    response: { text: () => '{"same_event": false}' },
  });
}

beforeEach(() => {
  generateContentMock.mockReset();
  __internal__.resetCache();
  resetArbiterBatchState(50);
});

describe('arbitrateMerge', () => {
  it('returns true when Gemini says same_event', async () => {
    mockYes();
    const r = await arbitrateMerge('A 사건', 'B 사건');
    expect(r.sameEvent).toBe(true);
    expect(r.fromCache).toBe(false);
  });

  it('returns false when Gemini says not same', async () => {
    mockNo();
    const r = await arbitrateMerge('축구 A', '축구 B');
    expect(r.sameEvent).toBe(false);
  });

  it('caches results across calls', async () => {
    mockYes();
    const r1 = await arbitrateMerge('티 A', '티 B');
    expect(r1.fromCache).toBe(false);
    const r2 = await arbitrateMerge('티 A', '티 B');
    expect(r2.fromCache).toBe(true);
    expect(r2.sameEvent).toBe(true);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('cache key is symmetric', async () => {
    mockYes();
    await arbitrateMerge('알파', '베타');
    const r = await arbitrateMerge('베타', '알파');
    expect(r.fromCache).toBe(true);
  });

  it('respects per-batch call limit', async () => {
    resetArbiterBatchState(2);
    mockYes(); mockYes();
    await arbitrateMerge('A1', 'B1');
    await arbitrateMerge('A2', 'B2');
    const r3 = await arbitrateMerge('A3', 'B3');
    expect(r3.skipped).toBe('budget');
    expect(r3.sameEvent).toBe(false);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to false on Gemini error', async () => {
    generateContentMock.mockRejectedValueOnce(new Error('boom'));
    const r = await arbitrateMerge('실패 A', '실패 B');
    expect(r.sameEvent).toBe(false);
    expect(r.skipped).toBeNull();
  });

  it('exposes stats', async () => {
    mockYes();
    await arbitrateMerge('S A', 'S B');
    const s = getArbiterStats();
    expect(s.calls).toBe(1);
    expect(s.cacheSize).toBe(1);
  });
});
