import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../src/config/index.js', () => ({
  config: { discordWebhookUrl: 'https://discord.test/webhook' },
}));

import { checkDbSize } from '../../src/services/dbMonitor.js';

function createMockPool(sizeBytes: number, tables: { relname: string; size: string }[] = []) {
  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('pg_database_size')) {
        return { rows: [{ size_bytes: String(sizeBytes) }] };
      }
      if (sql.includes('pg_statio_user_tables')) {
        return { rows: tables.map(t => ({ table: t.relname, size_mb: t.size })) };
      }
      return { rows: [] };
    }),
  } as any;
}

describe('checkDbSize', () => {
  beforeEach(() => { mockFetch.mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('does not alert when under 80MB', async () => {
    const pool = createMockPool(50 * 1024 * 1024);
    await checkDbSize(pool);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends warn alert when 80-95MB', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const pool = createMockPool(85 * 1024 * 1024, [
      { relname: 'posts', size: '60 MB' },
    ]);
    await checkDbSize(pool);
    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toContain('경고');
  });

  it('sends critical alert when >= 95MB', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const pool = createMockPool(96 * 1024 * 1024, [
      { relname: 'posts', size: '80 MB' },
    ]);
    await checkDbSize(pool);
    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toContain('위험');
  });

  it('handles query failure gracefully', async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error('connection lost')),
    } as any;
    // Should not throw
    await checkDbSize(pool);
  });
});
