import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { NaverDatalabScraper } from '../../src/scrapers/naver-datalab.js';
import datalabFixture from '../fixtures/naver-datalab-response.json';

vi.mock('axios');
vi.mock('../../src/config/index.js', () => ({
  config: { naverClientId: 'test-id', naverClientSecret: 'test-secret' },
}));

const mockPool = { query: vi.fn() } as any;

describe('NaverDatalabScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and return search trends as ScrapedPost[]', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts.length).toBeGreaterThan(0);
    expect(posts.length).toBeLessThanOrEqual(10);
    expect(posts[0]).toMatchObject({
      sourceKey: 'naver_datalab',
      sourceName: '네이버 검색 트렌드',
      category: 'trend',
    });
  });

  it('should include trend direction in title', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    const posts = await scraper.fetch();

    // 부동산: recent avg(60,72,80)=70.7, previous avg(45,40,42,48)=43.75 → +61% → 🔥
    const realestate = posts.find(p => p.title.includes('부동산'));
    expect(realestate).toBeDefined();
    expect(realestate!.title).toContain('🔥');
    expect(realestate!.title).toContain('+');

    // AI기술: recent avg(55,50,48)=51, previous avg(70,68,65,62)=66.25 → -23% → 📉
    const ai = posts.find(p => p.title.includes('AI기술'));
    expect(ai).toBeDefined();
    expect(ai!.title).toContain('📉');
  });

  it('should sort by absolute change percent descending', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    const posts = await scraper.fetch();

    const changes = posts.map(p => Math.abs(p.viewCount ?? 0));
    for (let i = 1; i < changes.length; i++) {
      expect(changes[i - 1]).toBeGreaterThanOrEqual(changes[i]);
    }
  });

  it('should use keywords as author field', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    const posts = await scraper.fetch();

    const realestate = posts.find(p => p.title.includes('부동산'));
    expect(realestate!.author).toContain('부동산');
    expect(realestate!.author).toContain('아파트 매매');
  });

  it('should generate datalab URL with encoded keyword', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].url).toContain('datalab.naver.com');
  });

  it('should return empty array when credentials are missing', async () => {
    const configMock = await import('../../src/config/index.js');
    (configMock.config as any).naverClientId = '';

    const scraper = new NaverDatalabScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
    expect(axios.post).not.toHaveBeenCalled();

    // restore
    (configMock.config as any).naverClientId = 'test-id';
  });

  it('should call Naver API with correct headers', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    await scraper.fetch();

    const call = vi.mocked(axios.post).mock.calls[0];
    expect(call[0]).toContain('openapi.naver.com');
    expect(call[2]?.headers?.['X-Naver-Client-Id']).toBe('test-id');
    expect(call[2]?.headers?.['X-Naver-Client-Secret']).toBe('test-secret');
  });

  it('should propagate API errors', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('auth failed'));

    const scraper = new NaverDatalabScraper(mockPool);
    await expect(scraper.fetch()).rejects.toThrow('auth failed');
  });

  it('should return empty array when response has no results', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { startDate: '2026-03-22', endDate: '2026-03-29', timeUnit: 'date', results: [] },
    });

    const scraper = new NaverDatalabScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
  });
});
