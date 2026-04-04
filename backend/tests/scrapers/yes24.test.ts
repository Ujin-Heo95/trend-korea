import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { Yes24BestsellerScraper } from '../../src/scrapers/yes24.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/yes24-bestseller.html'), 'utf-8');

describe('Yes24BestsellerScraper', () => {
  afterEach(() => vi.clearAllMocks());

  it('parses bestseller books from YES24', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new Yes24BestsellerScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBe(2);
    expect(posts[0].sourceKey).toBe('yes24_bestseller');
    expect(posts[0].category).toBe('books');
    expect(posts[0].url).toContain('yes24.com');
  });

  it('extracts title, author and metadata', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new Yes24BestsellerScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts[0].title).toContain('테스트 도서 1');
    expect(posts[0].author).toBe('저자 A');
    const meta = posts[0].metadata as any;
    expect(meta.rank).toBe(1);
    expect(meta.publisher).toBe('출판사 X');
  });

  it('limits to 30 items', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new Yes24BestsellerScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBeLessThanOrEqual(30);
  });
});
