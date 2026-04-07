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

  it('should fetch and return search trends as TrendKeywordInput[]', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.length).toBeLessThanOrEqual(10);
    expect(keywords[0]).toMatchObject({
      sourceKey: 'naver_datalab',
    });
    expect(typeof keywords[0].keyword).toBe('string');
    expect(typeof keywords[0].signalStrength).toBe('number');
  });

  it('should include trend data in metadata', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    // 부동산: recent avg(60,72,80)=70.7, previous avg(45,40,42,48)=43.75 → +61%
    const realestate = keywords.find(k => k.keyword === '부동산');
    expect(realestate).toBeDefined();
    expect((realestate!.metadata as any).changePct).toBeGreaterThan(0);
    expect((realestate!.metadata as any).keywords).toContain('아파트 매매');
  });

  it('should sort by signalStrength descending', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    for (let i = 1; i < keywords.length; i++) {
      expect(Math.abs(keywords[i - 1].signalStrength)).toBeGreaterThanOrEqual(Math.abs(keywords[i].signalStrength));
    }
  });

  it('should include keywords array in metadata', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    const realestate = keywords.find(k => k.keyword === '부동산');
    expect((realestate!.metadata as any).keywords).toContain('부동산');
    expect((realestate!.metadata as any).keywords).toContain('아파트 매매');
  });

  it('should throw when credentials are missing', async () => {
    const configMock = await import('../../src/config/index.js');
    (configMock.config as any).naverClientId = '';

    const scraper = new NaverDatalabScraper(mockPool);
    await expect(scraper.fetchTrendKeywords()).rejects.toThrow('NAVER_CLIENT_ID or NAVER_CLIENT_SECRET not configured');
    expect(axios.post).not.toHaveBeenCalled();

    // restore
    (configMock.config as any).naverClientId = 'test-id';
  });

  it('should call Naver API with correct headers', async () => {
    const configMock = await import('../../src/config/index.js');
    (configMock.config as any).naverClientId = 'test-id';
    (configMock.config as any).naverClientSecret = 'test-secret';
    vi.mocked(axios.post).mockResolvedValue({ data: datalabFixture });

    const scraper = new NaverDatalabScraper(mockPool);
    await scraper.fetchTrendKeywords();

    const call = vi.mocked(axios.post).mock.calls[0];
    expect(call[0]).toContain('openapi.naver.com');
    expect(call[2]?.headers?.['X-Naver-Client-Id']).toBe('test-id');
    expect(call[2]?.headers?.['X-Naver-Client-Secret']).toBe('test-secret');
  });

  it('should propagate API errors', async () => {
    const configMock = await import('../../src/config/index.js');
    (configMock.config as any).naverClientId = 'test-id';
    (configMock.config as any).naverClientSecret = 'test-secret';
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('auth failed'));

    const scraper = new NaverDatalabScraper(mockPool);
    await expect(scraper.fetchTrendKeywords()).rejects.toThrow('auth failed');
  });

  it('should return empty array when response has no results', async () => {
    const configMock = await import('../../src/config/index.js');
    (configMock.config as any).naverClientId = 'test-id';
    (configMock.config as any).naverClientSecret = 'test-secret';
    vi.mocked(axios.post).mockResolvedValue({
      data: { startDate: '2026-03-22', endDate: '2026-03-29', timeUnit: 'date', results: [] },
    });

    const scraper = new NaverDatalabScraper(mockPool);
    const keywords = await scraper.fetchTrendKeywords();

    expect(keywords).toEqual([]);
  });
});
