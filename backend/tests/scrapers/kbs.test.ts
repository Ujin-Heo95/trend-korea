import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { KbsScraper } from '../../src/scrapers/kbs.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/kbs_main.html'), 'utf-8');

describe('KbsScraper', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });
  afterEach(() => vi.clearAllMocks());

  it('parses news items from KBS main', async () => {
    const scraper = new KbsScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBeGreaterThanOrEqual(4);
    expect(posts[0].sourceKey).toBe('kbs');
    expect(posts[0].sourceName).toBe('KBS 뉴스');
  });

  it('absolutizes URLs and dedupes', async () => {
    const scraper = new KbsScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.every(p => p.url.startsWith('https://news.kbs.co.kr/news/pc/view/view.do?ncd='))).toBe(true);
    const urls = posts.map(p => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
