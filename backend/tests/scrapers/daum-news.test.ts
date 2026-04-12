import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { DaumNewsScraper } from '../../src/scrapers/daum-news.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/daum_news_home.html'), 'utf-8');

describe('DaumNewsScraper', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });
  afterEach(() => vi.clearAllMocks());

  it('parses v.daum.net article links from home', async () => {
    const scraper = new DaumNewsScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBeGreaterThanOrEqual(4);
    expect(posts[0].sourceKey).toBe('daum_news');
    expect(posts[0].sourceName).toBe('다음 뉴스');
    expect(posts[0].url).toMatch(/^https:\/\/v\.daum\.net\/v\/\d+$/);
  });

  it('dedupes URLs', async () => {
    const scraper = new DaumNewsScraper(null as any);
    const posts = await scraper.fetch();
    const urls = posts.map(p => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
