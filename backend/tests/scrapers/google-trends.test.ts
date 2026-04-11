import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import { GoogleTrendsScraper } from '../../src/scrapers/google-trends.js';

vi.mock('axios');

const mockPool = { query: vi.fn() } as any;

const rssFixture = readFileSync(
  resolve(__dirname, '../fixtures/google-trends-response.xml'),
  'utf-8',
);

describe('GoogleTrendsScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch daily trending searches for Korea as TrendKeywordInput[]', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: rssFixture });

    const scraper = new GoogleTrendsScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    expect(keywords.length).toBe(2);
    expect(keywords[0]).toMatchObject({
      sourceKey: 'google_trends',
      keyword: '손흥민',
    });
  });

  it('should include signalStrength and rankPosition', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: rssFixture });

    const scraper = new GoogleTrendsScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    expect(keywords[0].keyword).toBe('손흥민');
    expect(typeof keywords[0].signalStrength).toBe('number');
    expect(keywords[0].signalStrength).toBeGreaterThanOrEqual(0);
    expect(keywords[0].signalStrength).toBeLessThanOrEqual(1);
    expect(keywords[0].rankPosition).toBe(1);
  });

  it('should include articles in metadata', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: rssFixture });

    const scraper = new GoogleTrendsScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    const son = keywords.find(k => k.keyword === '손흥민');
    expect(son).toBeDefined();
    expect(son!.metadata).toBeDefined();
    const articles = (son!.metadata as any).articles as { url: string }[];
    expect(articles[0].url).toBe('https://news.example.com/son');
  });

  it('should cap at 30 items', async () => {
    // 40개 <item>을 가진 RSS 생성
    const items = Array.from({ length: 40 }, (_, i) =>
      `<item>
        <title>trend-${i}</title>
        <ht:approx_traffic>10,000+</ht:approx_traffic>
      </item>`
    ).join('\n');
    const bigRss = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss">
        <channel>${items}</channel>
      </rss>`;

    vi.mocked(axios.get).mockResolvedValueOnce({ data: bigRss });

    const scraper = new GoogleTrendsScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    expect(keywords.length).toBe(30);
  });

  it('should propagate error on fetch failure', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('timeout'));

    const scraper = new GoogleTrendsScraper(mockPool);
    await expect(scraper.fetchTrendKeywords()).rejects.toThrow('timeout');
  });
});
