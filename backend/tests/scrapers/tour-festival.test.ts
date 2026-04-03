import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { TourFestivalScraper } from '../../src/scrapers/tour-festival.js';
import fixture from '../fixtures/tour-festival-response.json';

vi.mock('axios');
vi.mock('../../src/config/index.js', () => ({
  config: { dataGoKrApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as any;

describe('TourFestivalScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and return festivals as ScrapedPost[]', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourFestivalScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toHaveLength(3);
    expect(posts[0]).toMatchObject({
      sourceKey: 'tour_festival',
      sourceName: '관광공사 축제/행사',
      category: 'travel',
    });
  });

  it('should map title and thumbnail correctly', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourFestivalScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].title).toBe('2026 진해군항제');
    expect(posts[0].thumbnail).toContain('festival1.jpg');
  });

  it('should generate visitkorea URL with contentid', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourFestivalScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].url).toContain('visitkorea.or.kr');
    expect(posts[0].url).toContain('123456');
  });

  it('should include event dates in metadata', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourFestivalScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].metadata).toMatchObject({
      eventStartDate: '20260401',
      eventEndDate: '20260410',
      contentId: '123456',
    });
  });

  it('should use address as author', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourFestivalScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].author).toContain('경남 창원시 진해구');
  });

  it('should call API with correct params', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new TourFestivalScraper(mockPool);
    await scraper.fetch();

    const call = vi.mocked(axios.get).mock.calls[0];
    expect(call[0]).toContain('KorService2/searchFestival');
    expect(call[1]?.params?.serviceKey).toBe('test-key');
    expect(call[1]?.params?.MobileApp).toBe('WeekLit');
    expect(call[1]?.params?._type).toBe('json');
  });

  it('should return empty array when API key is missing', async () => {
    const configMock = await import('../../src/config/index.js');
    (configMock.config as any).dataGoKrApiKey = '';

    const scraper = new TourFestivalScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();

    (configMock.config as any).dataGoKrApiKey = 'test-key';
  });

  it('should throw on API error response', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        response: {
          header: { resultCode: '9999', resultMsg: 'SERVICE_ERROR' },
          body: { items: '', numOfRows: 0, pageNo: 1, totalCount: 0 },
        },
      },
    });

    const scraper = new TourFestivalScraper(mockPool);
    await expect(scraper.fetch()).rejects.toThrow('SERVICE_ERROR');
  });

  it('should handle empty items gracefully', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        response: {
          header: { resultCode: '0000', resultMsg: 'OK' },
          body: { items: '', numOfRows: 30, pageNo: 1, totalCount: 0 },
        },
      },
    });

    const scraper = new TourFestivalScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
  });
});
