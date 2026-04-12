import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { YtnScraper } from '../../src/scrapers/ytn.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/ytn_list.html'), 'utf-8');

describe('YtnScraper', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });
  afterEach(() => vi.clearAllMocks());

  it('parses YTN _ln article links', async () => {
    const scraper = new YtnScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBeGreaterThanOrEqual(4);
    expect(posts[0].sourceKey).toBe('ytn');
    expect(posts[0].sourceName).toBe('YTN');
    expect(posts[0].url).toMatch(/^https:\/\/www\.ytn\.co\.kr\/_ln\/[A-Z0-9_]+$/i);
  });

  it('dedupes URLs and skips js links', async () => {
    const scraper = new YtnScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.every(p => !p.url.includes('javascript'))).toBe(true);
    const urls = posts.map(p => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
