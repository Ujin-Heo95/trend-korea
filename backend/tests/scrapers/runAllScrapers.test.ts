import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/client.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 }) },
}));
vi.mock('../../src/config/index.js', () => ({
  config: { youtubeApiKey: '' },
}));

vi.mock('../../src/scrapers/registry.js', () => ({
  buildScrapers: vi.fn().mockResolvedValue([
    { sourceKey: 'test-a', scraper: { run: vi.fn().mockResolvedValue({ count: 2 }) }, priority: 'high' },
    { sourceKey: 'test-b', scraper: { run: vi.fn().mockResolvedValue({ count: 3 }) }, priority: 'medium' },
  ]),
  getSourcesByPriority: vi.fn(),
}));

import { pool } from '../../src/db/client.js';
import { runAllScrapers, runScrapersByPriority } from '../../src/scrapers/index.js';
import { buildScrapers } from '../../src/scrapers/registry.js';

describe('runAllScrapers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a scraper_run row before each scraper and updates after', async () => {
    (buildScrapers as any).mockResolvedValueOnce([
      { sourceKey: 'test-a', scraper: { run: vi.fn().mockResolvedValue({ count: 2 }) }, priority: 'high' },
      { sourceKey: 'test-b', scraper: { run: vi.fn().mockResolvedValue({ count: 3 }) }, priority: 'medium' },
    ]);

    await runAllScrapers();
    const calls = (pool.query as any).mock.calls as [string, unknown[]][];
    const inserts = calls.filter(([sql]: [string]) => sql.includes('INSERT INTO scraper_runs'));
    const updates = calls.filter(([sql]: [string]) => sql.includes('UPDATE scraper_runs'));
    expect(inserts.length).toBe(2);
    expect(updates.length).toBe(2);
  });

  it('records error_message when scraper returns error', async () => {
    (buildScrapers as any).mockResolvedValueOnce([
      { sourceKey: 'err-test', scraper: { run: vi.fn().mockResolvedValue({ count: 0, error: 'timeout' }) }, priority: 'high' },
    ]);

    await runAllScrapers();
    const calls = (pool.query as any).mock.calls as [string, unknown[]][];
    const errUpdate = calls.find(([sql, params]: [string, unknown[]]) =>
      sql.includes('UPDATE scraper_runs') && (params as unknown[])[1] === 'timeout'
    );
    expect(errUpdate).toBeDefined();
  });
});

describe('runScrapersByPriority', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only runs scrapers matching the given priority', async () => {
    (buildScrapers as any).mockResolvedValueOnce([
      { sourceKey: 'test-a', scraper: { run: vi.fn().mockResolvedValue({ count: 2 }) }, priority: 'high' },
      { sourceKey: 'test-b', scraper: { run: vi.fn().mockResolvedValue({ count: 3 }) }, priority: 'medium' },
    ]);

    await runScrapersByPriority('high');
    const calls = (pool.query as any).mock.calls as [string, unknown[]][];
    const inserts = calls.filter(([sql]: [string]) => sql.includes('INSERT INTO scraper_runs'));
    expect(inserts.length).toBe(1);
  });
});
