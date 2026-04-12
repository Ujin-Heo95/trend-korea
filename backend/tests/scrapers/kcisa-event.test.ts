import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KcisaEventScraper } from '../../src/scrapers/kcisa-event.js';

vi.mock('axios');
vi.mock('../../src/scrapers/korean-dns.js', () => ({
  resolveKcisaRequest: vi.fn(async (url: string) => ({ url, headers: {}, httpsAgent: undefined })),
}));
vi.mock('../../src/config/index.js', () => ({
  config: { kcisaEventApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as unknown as import('pg').Pool;

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <body>
    <items>
      <item>
        <title>국립현대미술관 기획전</title>
        <description>현대미술 특별전</description>
        <url>https://example.com/event/1</url>
        <creator>국립현대미술관</creator>
        <regDate>2026-03-01</regDate>
        <collectionDb>ARKO</collectionDb>
      </item>
    </items>
  </body>
</response>`;

describe('KcisaEventScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });
  });

  it('maps event with creator as author and category=performance', async () => {
    const scraper = new KcisaEventScraper(mockPool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      sourceKey: 'kcisa_event',
      sourceName: '문화예술행사',
      title: '국립현대미술관 기획전',
      author: '국립현대미술관',
      category: 'performance',
    });
  });

  it('returns [] without api key', async () => {
    const cfg = await import('../../src/config/index.js');
    (cfg.config as { kcisaEventApiKey: string }).kcisaEventApiKey = '';
    expect(await new KcisaEventScraper(mockPool).fetch()).toEqual([]);
    (cfg.config as { kcisaEventApiKey: string }).kcisaEventApiKey = 'test-key';
  });
});
