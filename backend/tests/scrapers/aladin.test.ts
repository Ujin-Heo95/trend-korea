import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { AladinBestsellerScraper } from '../../src/scrapers/aladin.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/aladin-bestseller.html'), 'utf-8');

describe('AladinBestsellerScraper', () => {
  afterEach(() => vi.clearAllMocks());

  it('parses bestseller books from Aladin', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new AladinBestsellerScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBe(2);
    expect(posts[0].sourceKey).toBe('aladin_bestseller');
    expect(posts[0].category).toBe('books');
    expect(posts[0].url).toContain('aladin.co.kr');
  });

  it('extracts title, author, publisher from metadata', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new AladinBestsellerScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts[0].title).toContain('테스트 도서 A');
    expect(posts[0].author).toBe('작가1');
    const meta = posts[0].metadata as any;
    expect(meta.rank).toBe(1);
    expect(meta.publisher).toBe('출판1');
  });

  it('deduplicates by URL', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new AladinBestsellerScraper(null as any);
    const posts = await scraper.fetch();
    const urls = posts.map(p => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
