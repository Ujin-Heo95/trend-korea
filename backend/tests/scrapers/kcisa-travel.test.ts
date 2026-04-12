import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KcisaTravelScraper } from '../../src/scrapers/kcisa-travel.js';

vi.mock('axios');
vi.mock('../../src/scrapers/korean-dns.js', () => ({
  resolveKcisaRequest: vi.fn(async (url: string) => ({ url, headers: {}, httpsAgent: undefined })),
}));
vi.mock('../../src/config/index.js', () => ({
  config: { kcisaTravelApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as unknown as import('pg').Pool;

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>0000</resultCode><resultMsg>OK</resultMsg></header>
  <body>
    <items>
      <item>
        <title>경복궁 야간개장</title>
        <description>&lt;p&gt;조선의 정궁 경복궁&lt;/p&gt;</description>
        <url>https://example.com/gyeongbok</url>
        <spatialCoverage>서울 종로구</spatialCoverage>
        <viewCnt>1234</viewCnt>
        <insertDate>2026-03-15</insertDate>
      </item>
      <item>
        <title>해운대 해수욕장</title>
        <description>부산 대표 해변</description>
        <url>https://example.com/haeundae</url>
        <spatialCoverage>부산 해운대구</spatialCoverage>
        <viewCnt>5678</viewCnt>
        <insertDate>2026-03-10</insertDate>
      </item>
    </items>
  </body>
</response>`;

describe('KcisaTravelScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });
  });

  it('parses XML items as ScrapedPost[]', async () => {
    const scraper = new KcisaTravelScraper(mockPool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'kcisa_travel',
      sourceName: '추천여행지',
      title: '경복궁 야간개장',
      url: 'https://example.com/gyeongbok',
      category: 'travel',
      author: '서울 종로구',
      viewCount: 1234,
    });
  });

  it('strips HTML from description in metadata', async () => {
    const scraper = new KcisaTravelScraper(mockPool);
    const posts = await scraper.fetch();
    expect((posts[0].metadata as Record<string, string>).description).toBe('조선의 정궁 경복궁');
  });

  it('returns [] when api key missing', async () => {
    const cfg = await import('../../src/config/index.js');
    (cfg.config as { kcisaTravelApiKey: string }).kcisaTravelApiKey = '';
    const scraper = new KcisaTravelScraper(mockPool);
    expect(await scraper.fetch()).toEqual([]);
    (cfg.config as { kcisaTravelApiKey: string }).kcisaTravelApiKey = 'test-key';
  });
});
