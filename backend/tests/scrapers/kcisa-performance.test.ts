import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { KcisaPerformanceScraper } from '../../src/scrapers/kcisa-performance.js';

vi.mock('axios');
vi.mock('../../src/config/index.js', () => ({
  config: { dataGoKrApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as any;

const fixtureXml = readFileSync(
  join(__dirname, '../fixtures/kcisa-performance-response.xml'),
  'utf-8',
);

describe('KcisaPerformanceScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and return performances as ScrapedPost[]', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });

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
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    const musicalPosts = posts.filter(p => p.title.includes('뮤지컬'));
    expect(musicalPosts).toHaveLength(0);
  });

  it('should include non-KOPIS genres (전시, 국악)', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    const exhibitionPosts = posts.filter(p => p.title.includes('[전시]'));
    const gugakPosts = posts.filter(p => p.title.includes('[국악]'));

    expect(exhibitionPosts.length).toBeGreaterThan(0);
    expect(gugakPosts.length).toBeGreaterThan(0);
  });

  it('should format title as [genre] name — venue', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    const monet = posts.find(p => p.title.includes('모네'));
    expect(monet).toBeDefined();
    expect(monet!.title).toBe('[전시] 모네: 빛의 여행 — 서울시립미술관');
  });

  it('should include metadata with dataSource field', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].metadata).toMatchObject({
      dataSource: 'culture_data_go_kr',
    });
    expect(posts[0].metadata).toHaveProperty('venue');
    expect(posts[0].metadata).toHaveProperty('genre');
    expect(posts[0].metadata).toHaveProperty('seq');
  });

  it('should set thumbnail from XML', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    const monet = posts.find(p => p.title.includes('모네'));
    expect(monet!.thumbnail).toBe('https://example.com/monet.jpg');
  });

  it('should use area as author', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].author).toBe('서울');
  });

  it('should call data.go.kr API with correct params', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });

    const scraper = new KcisaPerformanceScraper(mockPool);
    await scraper.fetch();

    const call = vi.mocked(axios.get).mock.calls[0];
    expect(call[0]).toContain('publicperformancedisplays/period');
    expect(call[1]?.params?.serviceKey).toBe('test-key');
    expect(call[1]?.params?.rows).toBe(50);
  });

  it('should return empty array when API key is missing', async () => {
    const configMock = await import('../../src/config/index.js');
    (configMock.config as any).dataGoKrApiKey = '';

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();

    (configMock.config as any).dataGoKrApiKey = 'test-key';
  });

  it('should handle empty XML response', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: '<?xml version="1.0" encoding="UTF-8"?><response><msgBody></msgBody></response>',
    });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
  });

  it('should parse YYYYMMDD dates correctly', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });

    const scraper = new KcisaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();

    const monet = posts.find(p => p.title.includes('모네'));
    expect(monet!.publishedAt).toEqual(new Date('2026-03-01'));
  });
});
