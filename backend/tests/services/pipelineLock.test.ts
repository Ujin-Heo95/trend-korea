import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withPipelineLock, PIPELINE_LOCK_KEYS, getLockSkippedCount, resetLockSkippedCount } from '../../src/services/pipelineLock.js';

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

function makePool(acquireSequence: boolean[]): { pool: any; clients: FakeClient[] } {
  const clients: FakeClient[] = [];
  let i = 0;
  const pool = {
    connect: vi.fn(async () => {
      const locked = acquireSequence[i++] ?? false;
      const client: FakeClient = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked }] };
          if (sql.includes('pg_advisory_unlock')) return { rows: [{ ok: true }] };
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      clients.push(client);
      return client;
    }),
  };
  return { pool, clients };
}

describe('withPipelineLock', () => {
  beforeEach(() => {
    resetLockSkippedCount();
    delete process.env.PIPELINE_LOCK_ENABLED;
  });

  it('runs fn when lock is acquired', async () => {
    const { pool, clients } = makePool([true]);
    const fn = vi.fn(async () => 'ok');
    const result = await withPipelineLock(pool, PIPELINE_LOCK_KEYS.issuePipeline, 'test', fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
    expect(clients[0].release).toHaveBeenCalled();
  });

  it('returns null and increments skipped counter when lock is held', async () => {
    const { pool, clients } = makePool([false]);
    const fn = vi.fn(async () => 'should not run');
    const result = await withPipelineLock(pool, PIPELINE_LOCK_KEYS.issuePipeline, 'test', fn);
    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
    expect(getLockSkippedCount()).toBe(1);
    expect(clients[0].release).toHaveBeenCalled();
  });

  it('releases client even when fn throws', async () => {
    const { pool, clients } = makePool([true]);
    const fn = vi.fn(async () => { throw new Error('boom'); });
    await expect(
      withPipelineLock(pool, PIPELINE_LOCK_KEYS.issuePipeline, 'test', fn),
    ).rejects.toThrow('boom');
    expect(clients[0].release).toHaveBeenCalled();
  });

  it('bypasses lock when PIPELINE_LOCK_ENABLED=false', async () => {
    process.env.PIPELINE_LOCK_ENABLED = 'false';
    const { pool } = makePool([]);
    const fn = vi.fn(async () => 'ok');
    const result = await withPipelineLock(pool, PIPELINE_LOCK_KEYS.issuePipeline, 'test', fn);
    expect(result).toBe('ok');
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
