import { describe, it, expect, vi } from 'vitest';
import { MockScraper } from './fixtures/mockScraper.js';

describe('BaseScraper.saveToDb', () => {
  it('skips duplicates with ON CONFLICT DO NOTHING', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) } as any;
    const scraper = new MockScraper(mockPool);
    await scraper.saveToDb([{
      sourceKey: 'test', sourceName: '테스트',
      title: '중복 글', url: 'https://example.com/1',
    }]);
    expect(mockPool.query).toHaveBeenCalledOnce();
    const sql = mockPool.query.mock.calls[0][0] as string;
    expect(sql).toContain('ON CONFLICT');
  });

  it('single query for multiple posts (batch insert)', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rowCount: 2 }) } as any;
    const scraper = new MockScraper(mockPool);
    const result = await scraper.saveToDb([
      { sourceKey: 'test', sourceName: '테스트', title: '글1', url: 'https://example.com/1' },
      { sourceKey: 'test', sourceName: '테스트', title: '글2', url: 'https://example.com/2' },
    ]);
    expect(mockPool.query).toHaveBeenCalledOnce();
    expect(result).toBe(2);
  });

  it('handles empty post list without querying', async () => {
    const mockPool = { query: vi.fn() } as any;
    const scraper = new MockScraper(mockPool);
    const result = await scraper.saveToDb([]);
    expect(result).toBe(0);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('generates correct param count for multi-row batch (9 cols per row)', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rowCount: 3 }) } as any;
    const scraper = new MockScraper(mockPool);
    const posts = Array.from({ length: 3 }, (_, i) => ({
      sourceKey: 'test', sourceName: '테스트', title: `글${i}`, url: `https://example.com/${i}`,
    }));
    await scraper.saveToDb(posts);
    const [, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
    expect(params.length).toBe(27); // 3 posts × 9 columns
  });

  it('run() returns error string on fetch failure', async () => {
    const mockPool = { query: vi.fn() } as any;
    const scraper = new MockScraper(mockPool);
    scraper.fetch = vi.fn().mockRejectedValue(new Error('Fetch failed'));
    const result = await scraper.run();
    expect(result.count).toBe(0);
    expect(result.error).toContain('Fetch failed');
  });
});
