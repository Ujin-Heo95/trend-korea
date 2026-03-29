import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { RssScraper } from '../../src/scrapers/rss.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const xml = readFileSync(join(__dirname, '../fixtures/sample.rss.xml'), 'utf-8');
const googleTrendsXml = readFileSync(join(__dirname, '../fixtures/google-trends.rss.xml'), 'utf-8');

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

describe('RssScraper — Google Trends', () => {
  beforeAll(() => {
    nock('https://trends.google.com')
      .get('/trending/rss?geo=KR')
      .reply(200, googleTrendsXml, { 'Content-Type': 'application/rss+xml' });
  });
  afterAll(() => nock.cleanAll());

  it('parses Google Trends items with unique URLs', async () => {
    const scraper = new RssScraper({
      sourceKey: 'google_trends',
      sourceName: 'Google 트렌드',
      feedUrl: 'https://trends.google.com/trending/rss?geo=KR',
      maxItems: 30,
      pool: null as any,
    });
    const posts = await scraper.fetch();

    expect(posts).toHaveLength(3);

    // Each post should have a unique URL (not the feed URL)
    const urls = posts.map(p => p.url);
    const uniqueUrls = new Set(urls);
    expect(uniqueUrls.size).toBe(3);
    expect(urls.every(u => u !== 'https://trends.google.com/trending/rss?geo=KR')).toBe(true);
  });

  it('uses news_item_url when available', async () => {
    nock('https://trends.google.com')
      .get('/trending/rss2?geo=KR')
      .reply(200, googleTrendsXml, { 'Content-Type': 'application/rss+xml' });

    const scraper = new RssScraper({
      sourceKey: 'google_trends',
      sourceName: 'Google 트렌드',
      feedUrl: 'https://trends.google.com/trending/rss2?geo=KR',
      maxItems: 30,
      pool: null as any,
    });
    const posts = await scraper.fetch();

    // 송지효 has ht:news_item_url
    const songJihyo = posts.find(p => p.title.includes('송지효'));
    expect(songJihyo).toBeDefined();
    expect(songJihyo!.url).toBe('https://v.daum.net/v/20260329191301959');
    expect(songJihyo!.title).toContain('플러팅');
  });

  it('falls back to keyword-based URL when news_item_url missing', async () => {
    nock('https://trends.google.com')
      .get('/trending/rss3?geo=KR')
      .reply(200, googleTrendsXml, { 'Content-Type': 'application/rss+xml' });

    const scraper = new RssScraper({
      sourceKey: 'google_trends',
      sourceName: 'Google 트렌드',
      feedUrl: 'https://trends.google.com/trending/rss3?geo=KR',
      maxItems: 30,
      pool: null as any,
    });
    const posts = await scraper.fetch();

    // 서준영 has no ht:news_item_url
    const seo = posts.find(p => p.title.includes('서준영'));
    expect(seo).toBeDefined();
    expect(seo!.url).toContain('trendingsearches');
    expect(seo!.url).toContain(encodeURIComponent('서준영'));
  });

  it('parses traffic into viewCount', async () => {
    nock('https://trends.google.com')
      .get('/trending/rss4?geo=KR')
      .reply(200, googleTrendsXml, { 'Content-Type': 'application/rss+xml' });

    const scraper = new RssScraper({
      sourceKey: 'google_trends',
      sourceName: 'Google 트렌드',
      feedUrl: 'https://trends.google.com/trending/rss4?geo=KR',
      maxItems: 30,
      pool: null as any,
    });
    const posts = await scraper.fetch();

    const songJihyo = posts.find(p => p.title.includes('송지효'));
    expect(songJihyo!.viewCount).toBe(1000);
    expect(songJihyo!.author).toContain('1000+');
  });

  it('includes thumbnail from ht:picture', async () => {
    nock('https://trends.google.com')
      .get('/trending/rss5?geo=KR')
      .reply(200, googleTrendsXml, { 'Content-Type': 'application/rss+xml' });

    const scraper = new RssScraper({
      sourceKey: 'google_trends',
      sourceName: 'Google 트렌드',
      feedUrl: 'https://trends.google.com/trending/rss5?geo=KR',
      maxItems: 30,
      pool: null as any,
    });
    const posts = await scraper.fetch();

    const songJihyo = posts.find(p => p.title.includes('송지효'));
    expect(songJihyo!.thumbnail).toBe('https://example.com/pic1.jpg');
  });
});
