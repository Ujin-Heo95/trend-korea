import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KcisaPerformanceScraper } from '../../src/scrapers/kcisa-performance.js';
import fixture from '../fixtures/kcisa-performance-response.json';

vi.mock('axios');
vi.mock('../../src/config/index.js', () => ({
  config: { kcisaApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as any;

describe('KcisaPerformanceScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and return performances as ScrapedPost[]', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]).toMatchObject({
      sourceKey: 'kcisa_performance',
      sourceName: '문화예술공연(통합)',
      category: 'performance',
    });
  });

  it('should filter out KOPIS genres (뮤지컬)', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    const musicalPosts = posts.filter(p => p.title.includes('뮤지컬'));
    expect(musicalPosts).toHaveLength(0);
  });

  it('should include non-KOPIS genres (전시, 국악)', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    const exhibitionPosts = posts.filter(p => p.title.includes('[전시]'));
    const gugakPosts = posts.filter(p => p.title.includes('[국악]'));

    expect(exhibitionPosts.length).toBeGreaterThan(0);
    expect(gugakPosts.length).toBeGreaterThan(0);
  });

  it('should format title as [type] name — venue', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    const monet = posts.find(p => p.title.includes('모네'));
    expect(monet).toBeDefined();
    expect(monet!.title).toBe('[전시] 모네: 빛의 여행 — 서울시립미술관');
  });

  it('should include kcisa metadata with dataSource field', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].metadata).toMatchObject({
      dataSource: 'kcisa',
    });
    expect(posts[0].metadata).toHaveProperty('venue');
    expect(posts[0].metadata).toHaveProperty('type');
  });

  it('should use provided URL or fallback to culture.go.kr search', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    const monet = posts.find(p => p.title.includes('모네'));
    expect(monet!.url).toBe('https://example.com/monet');

    const modernArt = posts.find(p => p.title.includes('현대미술전'));
    if (modernArt) {
      expect(modernArt.url).toContain('culture.go.kr');
    }
  });

  it('should return empty array when API key is missing', async () => {
    const configMock = await import('../../src/config/index.js');
    (configMock.config as any).kcisaApiKey = '';

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();

    (configMock.config as any).kcisaApiKey = 'test-key';
  });

  it('should map viewCount from API response', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    const monet = posts.find(p => p.title.includes('모네'));
    expect(monet!.viewCount).toBe(1500);
  });
});
