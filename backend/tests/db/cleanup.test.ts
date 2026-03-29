import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../src/db/client.js', () => ({
  pool: { query: vi.fn() },
}));
vi.mock('../../src/config/index.js', () => ({
  config: { postTtlDays: 7 },
}));

import { pool } from '../../src/db/client.js';
import { cleanOldPosts } from '../../src/db/cleanup.js';

describe('cleanOldPosts', () => {
  afterEach(() => vi.clearAllMocks());

  it('executes DELETE with configured TTL', async () => {
    (pool.query as any).mockResolvedValue({ rowCount: 42 });
    const result = await cleanOldPosts();
    expect(result.deleted).toBe(42);
    const [sql, params] = (pool.query as any).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('DELETE FROM posts');
    expect(params[0]).toBe(7);
  });

  it('returns 0 when no posts deleted', async () => {
    (pool.query as any).mockResolvedValue({ rowCount: 0 });
    const result = await cleanOldPosts();
    expect(result.deleted).toBe(0);
  });

  it('handles null rowCount from pg driver', async () => {
    (pool.query as any).mockResolvedValue({ rowCount: null });
    const result = await cleanOldPosts();
    expect(result.deleted).toBe(0);
  });
});
