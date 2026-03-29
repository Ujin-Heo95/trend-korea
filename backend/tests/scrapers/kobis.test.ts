import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KobisBoxofficeScraper } from '../../src/scrapers/kobis.js';
import kobisFixture from '../fixtures/kobis-response.json';

vi.mock('axios');
vi.mock('../../src/config/index.js', () => ({
  config: { kobisApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as any;

describe('KobisBoxofficeScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and return daily box office as ScrapedPost[]', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: kobisFixture });

    const scraper = new KobisBoxofficeScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toHaveLength(3);
    expect(posts[0]).toMatchObject({
      sourceKey: 'kobis_boxoffice',
      sourceName: 'KOBIS 박스오피스',
      category: 'movie',
    });
    expect(posts[0].title).toContain('왕과 사는 남자');
    expect(posts[0].title).toContain('1위');
    expect(posts[0].url).toContain('kobis.or.kr');
    expect(posts[0].url).toContain('20242837');
  });

  it('should format rank change indicators correctly', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: kobisFixture });

    const scraper = new KobisBoxofficeScraper(mockPool);
    const posts = await scraper.fetch();

    // rank 1: rankInten=0, OLD → "-"
    expect(posts[0].title).toContain('-');
    // rank 3: rankOldAndNew=NEW → "🆕"
    expect(posts[2].title).toContain('🆕');
  });

  it('should use audience counts for viewCount and commentCount', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: kobisFixture });

    const scraper = new KobisBoxofficeScraper(mockPool);
    const posts = await scraper.fetch();

    // audiAcc=15427502 for first movie
    expect(posts[0].viewCount).toBe(15427502);
    // audiCnt=225292 for first movie
    expect(posts[0].commentCount).toBe(225292);
  });

  it('should return empty array when API key is missing', async () => {
    const configMock = await import('../../src/config/index.js');
    (configMock.config as any).kobisApiKey = '';

    const scraper = new KobisBoxofficeScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();

    // restore
    (configMock.config as any).kobisApiKey = 'test-key';
  });

  it('should call KOBIS API with yesterday date', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: kobisFixture });

    const scraper = new KobisBoxofficeScraper(mockPool);
    await scraper.fetch();

    const call = vi.mocked(axios.get).mock.calls[0];
    expect(call[0]).toContain('kobis.or.kr');
    expect(call[1]?.params?.key).toBe('test-key');
    expect(call[1]?.params?.targetDt).toMatch(/^\d{8}$/);
  });

  it('should return empty array on API error', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('network error'));

    const scraper = new KobisBoxofficeScraper(mockPool);
    await expect(scraper.fetch()).rejects.toThrow('network error');
  });

  it('should return empty array when response has no list', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { boxOfficeResult: { dailyBoxOfficeList: [] } },
    });

    const scraper = new KobisBoxofficeScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
  });
});
