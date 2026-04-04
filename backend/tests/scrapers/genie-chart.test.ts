import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { GenieChartScraper } from '../../src/scrapers/genie-chart.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/genie-chart.html'), 'utf-8');

describe('GenieChartScraper', () => {
  afterEach(() => vi.clearAllMocks());

  it('parses chart from Genie', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new GenieChartScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBe(2);
    expect(posts[0].sourceKey).toBe('genie_chart');
    expect(posts[0].category).toBe('music');
    expect(posts[0].url).toContain('genie.co.kr');
  });

  it('extracts rank, title, artist, album', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new GenieChartScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts[0].title).toContain('지니곡A');
    expect(posts[0].author).toBe('지니아티A');
    const meta = posts[0].metadata as any;
    expect(meta.rank).toBe(1);
    expect(meta.album).toBe('지니앨범A');
    expect(meta.songNo).toBe('90001');
  });
});
