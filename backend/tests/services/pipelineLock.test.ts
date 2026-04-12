import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withPipelineLock, PIPELINE_LOCK_KEYS, getLockSkippedCount, resetLockSkippedCount } from '../../src/services/pipelineLock.js';

const fakePool = {} as any;

describe('withPipelineLock (in-memory mutex)', () => {
  beforeEach(() => {
    resetLockSkippedCount();
    delete process.env.PIPELINE_LOCK_ENABLED;
  });

  it('runs fn when lock is free', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await withPipelineLock(fakePool, PIPELINE_LOCK_KEYS.issuePipeline, 'test', fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('returns null and skips when same key is in flight', async () => {
    let releaseFirst!: () => void;
    const firstDone = new Promise<void>(r => { releaseFirst = r; });
    const first = withPipelineLock(fakePool, PIPELINE_LOCK_KEYS.summarizer, 'first', async () => {
      await firstDone;
      return 1;
    });
    // Yield to let `first` enter the critical section.
    await new Promise(r => setTimeout(r, 0));
    const fn = vi.fn(async () => 'should not run');
    const second = await withPipelineLock(fakePool, PIPELINE_LOCK_KEYS.summarizer, 'second', fn);
    expect(second).toBeNull();
    expect(fn).not.toHaveBeenCalled();
    expect(getLockSkippedCount()).toBe(1);
    releaseFirst();
    await first;
  });

  it('releases lock even when fn throws so next tick can acquire', async () => {
    await expect(
      withPipelineLock(fakePool, PIPELINE_LOCK_KEYS.trackBDecay, 'test', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // Now next tick should acquire normally.
    const result = await withPipelineLock(fakePool, PIPELINE_LOCK_KEYS.trackBDecay, 'test', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('bypasses lock when PIPELINE_LOCK_ENABLED=false', async () => {
    process.env.PIPELINE_LOCK_ENABLED = 'false';
    const fn = vi.fn(async () => 'ok');
    const result = await withPipelineLock(fakePool, PIPELINE_LOCK_KEYS.issuePipeline, 'test', fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });
});
