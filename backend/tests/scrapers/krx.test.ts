import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KrxScraper } from '../../src/scrapers/krx.js';
import krxFixture from '../fixtures/krx-response.json';

vi.mock('axios');

const mockPool = { query: vi.fn() } as any;

describe('KrxScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and return top gainers/losers as ScrapedPost[]', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: krxFixture });

    const scraper = new KrxScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts.length).toBeGreaterThan(0);
    expect(posts.length).toBeLessThanOrEqual(30);
    expect(posts[0]).toMatchObject({
      sourceKey: 'krx',
      sourceName: 'KRX 시장',
      category: 'news',
    });
    expect(posts[0].title).toContain('삼성전자');
    expect(posts[0].url).toContain('data.krx.co.kr');
  });

  it('should sort by absolute fluctuation rate descending', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: krxFixture });

    const scraper = new KrxScraper(mockPool);
    const posts = await scraper.fetch();

    // 3.60% > 1.85% > 1.60% by absolute value
    expect(posts[0].title).toContain('삼성전자');
    expect(posts[0].title).toContain('+3.60%');
  });

  it('should return empty array on API error', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('network error'));

    const scraper = new KrxScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
  });

  it('should format today date as YYYYMMDD', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: krxFixture });

    const scraper = new KrxScraper(mockPool);
    await scraper.fetch();

    const call = vi.mocked(axios.post).mock.calls[0];
    const body = call[1] as string;
    expect(body).toContain('trdDd=');
    expect(body).toMatch(/trdDd=\d{8}/);
  });
});
