import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KcisaCcaExhibitionScraper } from '../../src/scrapers/kcisa-cca-exhibition.js';

vi.mock('axios');
vi.mock('../../src/scrapers/korean-dns.js', () => ({
  resolveKcisaRequest: vi.fn(async (url: string) => ({ url, headers: {}, httpsAgent: undefined })),
}));
vi.mock('../../src/config/index.js', () => ({
  config: { kcisaExhibitionApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as unknown as import('pg').Pool;

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <body>
    <items>
      <item>
        <TITLE>인상주의 특별전</TITLE>
        <URL>https://example.com/ex/1</URL>
        <CNTC_INSTT_NM>국립중앙박물관</CNTC_INSTT_NM>
        <CONTRIBUTOR>학예사 김</CONTRIBUTOR>
        <PERIOD>2026-04-01~2026-08-31</PERIOD>
        <IMAGE_OBJECT>https://example.com/ex.jpg</IMAGE_OBJECT>
      </item>
    </items>
  </body>
</response>`;

describe('KcisaCcaExhibitionScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });
  });

  it('formats title with [전시] prefix and venue', async () => {
    const scraper = new KcisaCcaExhibitionScraper(mockPool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('[전시] 인상주의 특별전 — 국립중앙박물관');
    expect(posts[0].thumbnail).toBe('https://example.com/ex.jpg');
    expect(posts[0].author).toBe('학예사 김');
    expect(posts[0].category).toBe('performance');
  });

  it('returns [] without api key', async () => {
    const cfg = await import('../../src/config/index.js');
    (cfg.config as { kcisaExhibitionApiKey: string }).kcisaExhibitionApiKey = '';
    expect(await new KcisaCcaExhibitionScraper(mockPool).fetch()).toEqual([]);
    (cfg.config as { kcisaExhibitionApiKey: string }).kcisaExhibitionApiKey = 'test-key';
  });
});
