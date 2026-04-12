import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KcisaFestivalScraper } from '../../src/scrapers/kcisa-festival.js';

vi.mock('axios');
vi.mock('../../src/scrapers/korean-dns.js', () => ({
  resolveKcisaRequest: vi.fn(async (url: string) => ({ url, headers: {}, httpsAgent: undefined })),
}));
vi.mock('../../src/config/index.js', () => ({
  config: { kcisaFestivalApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as unknown as import('pg').Pool;

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <body>
    <items>
      <item>
        <title>진해군항제 2026</title>
        <description>벚꽃 축제</description>
        <url>https://example.com/festival/1</url>
        <referenceIdentifier>https://example.com/img1.jpg</referenceIdentifier>
        <spatialCoverage>경남 창원시</spatialCoverage>
        <eventPeriod>2026-04-01 ~ 2026-04-10</eventPeriod>
        <subjectCategory>지역축제</subjectCategory>
        <regDate>2026-03-01</regDate>
      </item>
    </items>
  </body>
</response>`;

describe('KcisaFestivalScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });
  });

  it('maps to ScrapedPost with thumbnail and event period', async () => {
    const scraper = new KcisaFestivalScraper(mockPool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      sourceKey: 'kcisa_festival',
      sourceName: '지역축제정보',
      title: '진해군항제 2026',
      url: 'https://example.com/festival/1',
      thumbnail: 'https://example.com/img1.jpg',
      author: '경남 창원시',
      category: 'travel',
    });
    expect((posts[0].metadata as Record<string, string>).eventPeriod).toBe('2026-04-01 ~ 2026-04-10');
  });

  it('returns [] without api key', async () => {
    const cfg = await import('../../src/config/index.js');
    (cfg.config as { kcisaFestivalApiKey: string }).kcisaFestivalApiKey = '';
    expect(await new KcisaFestivalScraper(mockPool).fetch()).toEqual([]);
    (cfg.config as { kcisaFestivalApiKey: string }).kcisaFestivalApiKey = 'test-key';
  });
});
