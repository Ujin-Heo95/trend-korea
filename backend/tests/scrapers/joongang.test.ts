import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { JoongangScraper } from '../../src/scrapers/joongang.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/joongang_home.html'), 'utf-8');

describe('JoongangScraper', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });
  afterEach(() => vi.clearAllMocks());

  it('parses unique articles from 중앙일보 home', async () => {
    const scraper = new JoongangScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBeGreaterThanOrEqual(4);
    expect(posts.length).toBeLessThanOrEqual(30);
    expect(posts[0].sourceKey).toBe('joins');
    expect(posts[0].sourceName).toBe('중앙일보');
    expect(posts[0].url).toMatch(/^https:\/\/www\.joongang\.co\.kr\/article\/\d+$/);
  });

  it('dedupes by URL', async () => {
    const scraper = new JoongangScraper(null as any);
    const posts = await scraper.fetch();
    const urls = posts.map(p => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('extracts non-empty titles', async () => {
    const scraper = new JoongangScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.every(p => p.title.length >= 5)).toBe(true);
  });
});
