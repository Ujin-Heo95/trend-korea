import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/client.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 }) },
}));
vi.mock('../../src/config/index.js', () => ({
  config: { youtubeApiKey: '' },
}));
vi.mock('../../src/scrapers/dcinside.js',  () => ({ DcinsideScraper:  vi.fn(() => ({ run: vi.fn().mockResolvedValue({ count: 2 }) })) }));
vi.mock('../../src/scrapers/fmkorea.js',   () => ({ FmkoreaScraper:   vi.fn(() => ({ run: vi.fn().mockResolvedValue({ count: 3 }) })) }));
vi.mock('../../src/scrapers/ruliweb.js',   () => ({ RuliwebScraper:   vi.fn(() => ({ run: vi.fn().mockResolvedValue({ count: 1 }) })) }));
vi.mock('../../src/scrapers/theqoo.js',    () => ({ TheqooScraper:    vi.fn(() => ({ run: vi.fn().mockResolvedValue({ count: 0 }) })) }));
vi.mock('../../src/scrapers/instiz.js',    () => ({ InstizScraper:    vi.fn(() => ({ run: vi.fn().mockResolvedValue({ count: 0 }) })) }));
vi.mock('../../src/scrapers/natepann.js',  () => ({ NatepannScraper:  vi.fn(() => ({ run: vi.fn().mockResolvedValue({ count: 5 }) })) }));
vi.mock('../../src/scrapers/youtube.js',   () => ({ YoutubeScraper:   vi.fn(() => ({ run: vi.fn().mockResolvedValue({ count: 0 }) })) }));
vi.mock('../../src/scrapers/rss.js', () => ({
  RssScraper: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ count: 4 }) })),
  RSS_SOURCES: [{ sourceKey: 'clien', sourceName: '클리앙', feedUrl: 'https://x.com/rss', maxItems: 30 }],
}));

import { pool } from '../../src/db/client.js';
import { runAllScrapers } from '../../src/scrapers/index.js';

describe('runAllScrapers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a scraper_run row before each scraper and updates after', async () => {
    await runAllScrapers();
    const calls = (pool.query as any).mock.calls as [string, unknown[]][];
    const inserts = calls.filter(([sql]: [string]) => sql.includes('INSERT INTO scraper_runs'));
    const updates = calls.filter(([sql]: [string]) => sql.includes('UPDATE scraper_runs'));
    expect(inserts.length).toBeGreaterThan(0);
    expect(updates.length).toBe(inserts.length);
  });

  it('records error_message when scraper returns error', async () => {
    const { DcinsideScraper } = await import('../../src/scrapers/dcinside.js');
    (DcinsideScraper as any).mockImplementationOnce(() => ({
      run: vi.fn().mockResolvedValue({ count: 0, error: 'timeout' }),
    }));
    await runAllScrapers();
    const calls = (pool.query as any).mock.calls as [string, unknown[]][];
    const errUpdate = calls.find(([sql, params]: [string, unknown[]]) =>
      sql.includes('UPDATE scraper_runs') && (params as unknown[])[1] === 'timeout'
    );
    expect(errUpdate).toBeDefined();
  });
});
