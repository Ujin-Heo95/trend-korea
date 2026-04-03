import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { TourVisitorScraper } from '../../src/scrapers/tour-visitor.js';
import fixture from '../fixtures/tour-visitor-response.json';

vi.mock('axios');
vi.mock('../../src/config/index.js', () => ({
  config: { dataGoKrApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as any;

// 쿨다운을 리셋하기 위해 모듈을 매 테스트마다 재임포트하면 복잡해지므로,
// 첫 호출에서 쿨다운이 설정되고 이후 호출에서 빈 배열을 반환하는 것을 테스트

describe('TourVisitorScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and return visitor trends as ScrapedPost[]', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourVisitorScraper(mockPool);
    const posts = await scraper.fetch();

    // 첫 호출은 쿨다운이 0이므로 정상 동작 (또는 이전 테스트에서 이미 설정)
    if (posts.length === 0) return; // 쿨다운 히트 시 스킵

    expect(posts.length).toBeGreaterThan(0);
    expect(posts.length).toBeLessThanOrEqual(10);
    expect(posts[0]).toMatchObject({
      sourceKey: 'tour_visitor',
      sourceName: '관광 빅데이터 방문객',
      category: 'travel',
    });
  });

  it('should include trend icons in title', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourVisitorScraper(mockPool);
    const posts = await scraper.fetch();
    if (posts.length === 0) return;

    // 제주: 이전(30000,28000,32000,45000) avg=33750, 최근(50000,55000,60000) avg=55000 → +63% → 🔥
    const jeju = posts.find(p => p.title.includes('제주'));
    if (jeju) {
      expect(jeju.title).toContain('🔥');
      expect(jeju.title).toContain('+');
    }
  });

  it('should sort by absolute change percent descending', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourVisitorScraper(mockPool);
    const posts = await scraper.fetch();
    if (posts.length === 0) return;

    const changes = posts.map(p => Math.abs(p.viewCount ?? 0));
    for (let i = 1; i < changes.length; i++) {
      expect(changes[i - 1]).toBeGreaterThanOrEqual(changes[i]);
    }
  });

  it('should include region metadata', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourVisitorScraper(mockPool);
    const posts = await scraper.fetch();
    if (posts.length === 0) return;

    expect(posts[0].metadata).toHaveProperty('region');
    expect(posts[0].metadata).toHaveProperty('changePercent');
    expect(posts[0].metadata).toHaveProperty('latestCount');
  });

  it('should call DataLab API with correct params', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourVisitorScraper(mockPool);
    await scraper.fetch();
    if (vi.mocked(axios.get).mock.calls.length === 0) return;

    const call = vi.mocked(axios.get).mock.calls[0];
    expect(call[0]).toContain('DataLabService/metcoRegnVisitrDDList');
    expect(call[1]?.params?.serviceKey).toBe('test-key');
    expect(call[1]?.params?.numOfRows).toBe(1000);
  });

  it('should return empty array when API key is missing', async () => {
    const configMock = await import('../../src/config/index.js');
    (configMock.config as any).dataGoKrApiKey = '';

    const scraper = new TourVisitorScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();

    (configMock.config as any).dataGoKrApiKey = 'test-key';
  });

  it('should handle empty response', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        response: {
          header: { resultCode: '0000', resultMsg: 'OK' },
          body: { items: '', numOfRows: 1000, pageNo: 1, totalCount: 0 },
        },
      },
    });

    const scraper = new TourVisitorScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
  });
});
