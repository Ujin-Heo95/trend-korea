import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { GoogleTrendsScraper } from '../../src/scrapers/google-trends.js';
import trendsFixture from '../fixtures/google-trends-response.json';

vi.mock('axios');

const mockPool = { query: vi.fn() } as any;

describe('GoogleTrendsScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch daily trending searches for Korea as TrendKeywordInput[]', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: trendsFixture });

    const scraper = new GoogleTrendsScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    expect(keywords.length).toBe(2);
    expect(keywords[0]).toMatchObject({
      sourceKey: 'google_trends',
      keyword: '손흥민',
    });
  });

  it('should include signalStrength and rankPosition', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: trendsFixture });

    const scraper = new GoogleTrendsScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    expect(keywords[0].keyword).toBe('손흥민');
    expect(typeof keywords[0].signalStrength).toBe('number');
    expect(keywords[0].signalStrength).toBeGreaterThanOrEqual(0);
    expect(keywords[0].signalStrength).toBeLessThanOrEqual(1);
    expect(keywords[0].rankPosition).toBe(1);
  });

  it('should include articles in metadata', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: trendsFixture });

    const scraper = new GoogleTrendsScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    const son = keywords.find(k => k.keyword === '손흥민');
    expect(son).toBeDefined();
    expect(son!.metadata).toBeDefined();
    const articles = (son!.metadata as any).articles as { url: string }[];
    expect(articles[0].url).toBe('https://news.example.com/son');
  });

  it('should cap at 30 items', async () => {
    const manyItems = structuredClone(trendsFixture);
    const template = manyItems.default.trendingSearchesDays[0].trendingSearches[0];
    manyItems.default.trendingSearchesDays[0].trendingSearches = Array.from(
      { length: 40 },
      (_, i) => ({ ...template, title: { query: `trend-${i}` } }),
    );
    vi.mocked(axios.get).mockResolvedValueOnce({ data: manyItems });

    const scraper = new GoogleTrendsScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    expect(keywords.length).toBe(30);
  });

  it('should return empty array on error', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('timeout'));

    const scraper = new GoogleTrendsScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    expect(keywords).toEqual([]);
  });
});
