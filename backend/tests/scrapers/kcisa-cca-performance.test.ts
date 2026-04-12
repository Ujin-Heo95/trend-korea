import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KcisaCcaPerformanceScraper } from '../../src/scrapers/kcisa-cca-performance.js';

vi.mock('axios');
vi.mock('../../src/scrapers/korean-dns.js', () => ({
  resolveKcisaRequest: vi.fn(async (url: string) => ({ url, headers: {}, httpsAgent: undefined })),
}));
vi.mock('../../src/config/index.js', () => ({
  config: { kcisaPerformanceApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as unknown as import('pg').Pool;

// CCA APIs use uppercase tags
const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <body>
    <items>
      <item>
        <TITLE>피아노 리사이틀</TITLE>
        <URL>https://example.com/cca/1</URL>
        <GENRE>클래식</GENRE>
        <CNTC_INSTT_NM>예술의전당</CNTC_INSTT_NM>
        <PERIOD>2026-05-01~2026-05-01</PERIOD>
        <IMAGE_OBJECT>https://example.com/img.jpg</IMAGE_OBJECT>
        <CHARGE>50000원</CHARGE>
      </item>
      <item>
        <TITLE>중복 항목</TITLE>
        <URL>https://example.com/cca/1</URL>
        <GENRE>클래식</GENRE>
      </item>
      <item>
        <TITLE>국악 특별공연</TITLE>
        <URL>https://example.com/cca/2</URL>
        <GENRE>국악</GENRE>
        <CNTC_INSTT_NM>국립국악원</CNTC_INSTT_NM>
      </item>
    </items>
  </body>
</response>`;

describe('KcisaCcaPerformanceScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });
  });

  it('dedupes by URL and formats title with [genre] name — venue', async () => {
    const scraper = new KcisaCcaPerformanceScraper(mockPool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('[클래식] 피아노 리사이틀 — 예술의전당');
    expect(posts[1].title).toBe('[국악] 국악 특별공연 — 국립국악원');
  });

  it('returns [] without api key', async () => {
    const cfg = await import('../../src/config/index.js');
    (cfg.config as { kcisaPerformanceApiKey: string }).kcisaPerformanceApiKey = '';
    expect(await new KcisaCcaPerformanceScraper(mockPool).fetch()).toEqual([]);
    (cfg.config as { kcisaPerformanceApiKey: string }).kcisaPerformanceApiKey = 'test-key';
  });
});
