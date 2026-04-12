import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { SeoulCulturalEventScraper } from '../../src/scrapers/seoul-cultural-event.js';

vi.mock('axios');
vi.mock('../../src/config/index.js', () => ({
  config: { seoulOpenApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as unknown as import('pg').Pool;

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<culturalEventInfo>
  <list_total_count>1</list_total_count>
  <RESULT><CODE>INFO-000</CODE></RESULT>
  <row>
    <CODENAME>전시/미술</CODENAME>
    <GUNAME>종로구</GUNAME>
    <TITLE>봄꽃 사진전</TITLE>
    <PLACE>광화문 갤러리</PLACE>
    <ORG_NAME>서울시</ORG_NAME>
    <ORG_LINK>https://example.com/event/spring</ORG_LINK>
    <MAIN_IMG>https://example.com/spring.jpg</MAIN_IMG>
    <STRTDATE>2026-04-01 00:00:00.0</STRTDATE>
    <END_DATE>2026-04-30 00:00:00.0</END_DATE>
    <USE_FEE></USE_FEE>
    <IS_FREE>무료</IS_FREE>
    <USE_TRGT>전체</USE_TRGT>
    <HMPG_ADDR>https://example.com/spring</HMPG_ADDR>
    <DATE>2026-04-01~2026-04-30</DATE>
    <LOT>126.97</LOT>
    <LAT>37.57</LAT>
  </row>
</culturalEventInfo>`;

const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<RESULT><CODE>INFO-200</CODE><MESSAGE>해당하는 데이터가 없습니다</MESSAGE></RESULT>`;

describe('SeoulCulturalEventScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps cultural event row to ScrapedPost', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });
    const scraper = new SeoulCulturalEventScraper(mockPool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      sourceKey: 'seoul_cultural_event',
      sourceName: '서울문화행사',
      title: '[전시/미술] 봄꽃 사진전 — 광화문 갤러리',
      url: 'https://example.com/event/spring',
      thumbnail: 'https://example.com/spring.jpg',
      author: '종로구',
      category: 'travel',
    });
  });

  it('returns [] for INFO-200 (no data)', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: errorXml });
    const scraper = new SeoulCulturalEventScraper(mockPool);
    expect(await scraper.fetch()).toEqual([]);
  });

  it('returns [] without api key', async () => {
    const cfg = await import('../../src/config/index.js');
    (cfg.config as { seoulOpenApiKey: string }).seoulOpenApiKey = '';
    expect(await new SeoulCulturalEventScraper(mockPool).fetch()).toEqual([]);
    (cfg.config as { seoulOpenApiKey: string }).seoulOpenApiKey = 'test-key';
  });
});
