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

  it('returns count of saved posts', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) } as any;
    const scraper = new MockScraper(mockPool);
    const result = await scraper.saveToDb([{
      sourceKey: 'test', sourceName: '테스트',
      title: '새 글', url: 'https://example.com/2',
    }]);
    expect(result).toBe(1);
  });

  it('handles empty post list', async () => {
    const mockPool = { query: vi.fn() } as any;
    const scraper = new MockScraper(mockPool);
    const result = await scraper.saveToDb([]);
    expect(result).toBe(0);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('runs fetch and saves to database', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) } as any;
    const scraper = new MockScraper(mockPool);
    scraper.fetch = vi.fn().mockResolvedValue([{
      sourceKey: 'test', sourceName: '테스트',
      title: '글', url: 'https://example.com/3',
    }]);
    const result = await scraper.run();
    expect(result.count).toBe(1);
    expect(result.error).toBeUndefined();
    expect(scraper.fetch).toHaveBeenCalled();
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('returns error on fetch failure', async () => {
    const mockPool = { query: vi.fn() } as any;
    const scraper = new MockScraper(mockPool);
    scraper.fetch = vi.fn().mockRejectedValue(new Error('Fetch failed'));
    const result = await scraper.run();
    expect(result.count).toBe(0);
    expect(result.error).toContain('Fetch failed');
  });
});
