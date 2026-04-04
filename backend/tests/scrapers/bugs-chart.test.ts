import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { BugsChartScraper } from '../../src/scrapers/bugs-chart.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/bugs-chart.html'), 'utf-8');

describe('BugsChartScraper', () => {
  afterEach(() => vi.clearAllMocks());

  it('parses chart from Bugs Music', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new BugsChartScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBe(2);
    expect(posts[0].sourceKey).toBe('bugs_chart');
    expect(posts[0].category).toBe('music');
    expect(posts[0].url).toContain('bugs.co.kr');
  });

  it('extracts rank, title, artist, album', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new BugsChartScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts[0].title).toContain('테스트곡A');
    expect(posts[0].author).toBe('아티스트A');
    const meta = posts[0].metadata as any;
    expect(meta.rank).toBe(1);
    expect(meta.album).toBe('앨범A');
    expect(meta.songNo).toBe('1001');
  });
});
