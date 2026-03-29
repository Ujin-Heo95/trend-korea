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

  it('should fetch daily trending searches for Korea', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: trendsFixture });

    const scraper = new GoogleTrendsScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts.length).toBe(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'google_trends',
      sourceName: 'Google 트렌드',
      category: 'trend',
    });
  });

  it('should use query as title and article URL as link', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: trendsFixture });

    const scraper = new GoogleTrendsScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].title).toContain('손흥민');
    expect(posts[0].url).toBe('https://news.example.com/son');
    expect(posts[0].thumbnail).toBe('https://example.com/son.jpg');
  });

  it('should fallback to Google search URL if no article', async () => {
    const noArticle = structuredClone(trendsFixture);
    noArticle.default.trendingSearchesDays[0].trendingSearches[0].articles = [];
    vi.mocked(axios.get).mockResolvedValueOnce({ data: noArticle });

    const scraper = new GoogleTrendsScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].url).toContain('google.com/search');
    expect(posts[0].url).toContain(encodeURIComponent('손흥민'));
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
    const posts = await scraper.fetch();

    expect(posts.length).toBe(30);
  });

  it('should return empty array on error', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('timeout'));

    const scraper = new GoogleTrendsScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
  });
});
