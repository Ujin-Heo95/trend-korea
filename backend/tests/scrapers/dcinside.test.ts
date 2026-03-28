import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { DcinsideScraper } from '../../src/scrapers/dcinside.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/dcinside_best.html'), 'utf-8');

describe('DcinsideScraper', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('parses best posts from DC인사이드', async () => {
    const scraper = new DcinsideScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0].sourceKey).toBe('dcinside');
    expect(posts[0].url).toContain('dcinside.com');
  });

  it('extracts title, url, author, and viewCount', async () => {
    const scraper = new DcinsideScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBe(2);
    expect(posts[0].title).toBe('첫번째 실시간 베스트 글');
    expect(posts[0].url).toBe('https://gall.dcinside.com/board/view/?id=hit&no=12345');
    expect(posts[0].author).toBe('닉네임1');
    expect(posts[0].viewCount).toBe(1234);
    expect(posts[1].title).toBe('두번째 실시간 베스트 글');
    expect(posts[1].author).toBe('닉네임2');
    expect(posts[1].viewCount).toBe(5678);
  });

  it('includes sourceName in all posts', async () => {
    const scraper = new DcinsideScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.every(p => p.sourceName === 'DC인사이드')).toBe(true);
  });
});
