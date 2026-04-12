import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { SeoulCitydataScraper } from '../../src/scrapers/seoul-citydata.js';

vi.mock('axios');
vi.mock('../../src/config/index.js', () => ({
  config: { seoulOpenApiKey: 'test-key' },
}));

const mockPool = { query: vi.fn() } as unknown as import('pg').Pool;

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<SeoulRtd.citydata>
  <CITYDATA>
    <AREA_NM>명동</AREA_NM>
    <LIVE_PPLTN_STTS>
      <LIVE_PPLTN_STTS>
        <AREA_CONGEST_LVL>붐빔</AREA_CONGEST_LVL>
        <AREA_CONGEST_MSG>사람이 많습니다</AREA_CONGEST_MSG>
        <AREA_PPLTN_MIN>15000</AREA_PPLTN_MIN>
        <AREA_PPLTN_MAX>17000</AREA_PPLTN_MAX>
        <PPLTN_TIME>2026-04-12 14:00</PPLTN_TIME>
      </LIVE_PPLTN_STTS>
    </LIVE_PPLTN_STTS>
  </CITYDATA>
</SeoulRtd.citydata>`;

describe('SeoulCitydataScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.get).mockResolvedValue({ data: fixtureXml });
  });

  it('parses citydata XML for monitored areas', async () => {
    const scraper = new SeoulCitydataScraper(mockPool);
    const posts = await scraper.fetch();
    // 10 monitored areas, all using same fixture
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]).toMatchObject({
      sourceKey: 'seoul_citydata',
      sourceName: '서울 실시간 도시데이터',
      category: 'travel',
    });
    expect(posts[0].title).toContain('붐빔');
    expect((posts[0].metadata as Record<string, unknown>).populationMin).toBe(15000);
  });

  it('returns [] when key missing', async () => {
    const cfg = await import('../../src/config/index.js');
    (cfg.config as { seoulOpenApiKey: string }).seoulOpenApiKey = '';
    const posts = await new SeoulCitydataScraper(mockPool).fetch();
    expect(posts).toEqual([]);
    (cfg.config as { seoulOpenApiKey: string }).seoulOpenApiKey = 'test-key';
  });
}, 20000);
