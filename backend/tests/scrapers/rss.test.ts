import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { RssScraper } from '../../src/scrapers/rss.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const xml = readFileSync(join(__dirname, '../fixtures/sample.rss.xml'), 'utf-8');

describe('RssScraper', () => {
  beforeAll(() => {
    nock('https://example.com')
      .get('/rss')
      .reply(200, xml, { 'Content-Type': 'application/rss+xml' });
  });
  afterAll(() => nock.cleanAll());

  it('parses RSS items into ScrapedPost[]', async () => {
    const scraper = new RssScraper({
      sourceKey: 'test',
      sourceName: '테스트',
      feedUrl: 'https://example.com/rss',
      maxItems: 10,
      pool: null as any,
    });
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('첫 번째 기사 제목');
    expect(posts[0].url).toBe('https://example.com/article/1');
    expect(posts[0].sourceKey).toBe('test');
    expect(posts[0].sourceName).toBe('테스트');
    expect(posts[0].author).toBe('홍길동');
  });

  it('respects maxItems limit', async () => {
    nock('https://example.com')
      .get('/rss-limit')
      .reply(200, xml, { 'Content-Type': 'application/rss+xml' });

    const scraper = new RssScraper({
      sourceKey: 'test-limit',
      sourceName: '테스트',
      feedUrl: 'https://example.com/rss-limit',
      maxItems: 1,
      pool: null as any,
    });
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('첫 번째 기사 제목');
  });

  it('filters out posts without URLs', async () => {
    const xmlWithoutLink = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>테스트 피드</title>
    <item>
      <title>URL 없는 기사</title>
    </item>
    <item>
      <title>URL 있는 기사</title>
      <link>https://example.com/article/3</link>
    </item>
  </channel>
</rss>`;

    nock('https://example.com')
      .get('/rss-no-link')
      .reply(200, xmlWithoutLink, { 'Content-Type': 'application/rss+xml' });

    const scraper = new RssScraper({
      sourceKey: 'test-filter',
      sourceName: '테스트',
      feedUrl: 'https://example.com/rss-no-link',
      maxItems: 10,
      pool: null as any,
    });
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('URL 있는 기사');
  });
});

// Google Trends RSS tests removed: google_trends is no longer an RSS source.
// It now uses GoogleTrendsScraper (TrendSignalScraper) and fetches TrendKeywordInput[] via fetchTrendKeywords().
