import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { MbcScraper } from '../../src/scrapers/mbc.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/mbc_replay.html'), 'utf-8');

describe('MbcScraper', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });
  afterEach(() => vi.clearAllMocks());

  it('parses 뉴스데스크 다시보기 articles', async () => {
    const scraper = new MbcScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBeGreaterThanOrEqual(4);
    expect(posts[0].sourceKey).toBe('mbc');
    expect(posts[0].sourceName).toBe('MBC 뉴스');
    expect(posts[0].url).toMatch(/^https:\/\/imnews\.imbc\.com\/.*\/article\/\d+_\d+\.html$/);
  });

  it('dedupes article URLs', async () => {
    const scraper = new MbcScraper(null as any);
    const posts = await scraper.fetch();
    const urls = posts.map(p => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
