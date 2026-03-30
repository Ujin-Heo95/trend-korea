import { describe, it, expect } from 'vitest';
import { ApifyXScraper } from '../../src/scrapers/apify-x.js';
import type { Pool } from 'pg';

describe('ApifyXScraper.mapResult', () => {
  const pool = {} as Pool;
  const scraper = new ApifyXScraper(pool);

  it('maps a standard tweet', () => {
    const item = {
      full_text: '속보: 서울시 새로운 정책 발표 화제',
      url: 'https://twitter.com/user/status/123456',
      user: { screen_name: 'newsbot_kr' },
      retweet_count: 500,
      favorite_count: 1200,
      views_count: 50000,
      reply_count: 89,
      created_at: 'Mon Mar 31 09:00:00 +0000 2026',
      entities: { media: [{ media_url_https: 'https://pbs.twimg.com/media/photo.jpg' }] },
    };
    const post = scraper.mapResult(item);
    expect(post).not.toBeNull();
    expect(post!.sourceKey).toBe('apify_x_trending');
    expect(post!.sourceName).toBe('X (Twitter)');
    expect(post!.author).toBe('@newsbot_kr');
    expect(post!.viewCount).toBe(50000);
    expect(post!.commentCount).toBe(89);
    expect(post!.metadata).toEqual({ platform: 'x', retweets: 500, likes: 1200 });
  });

  it('truncates long tweets to 100 chars', () => {
    const longText = 'A'.repeat(150);
    const item = { full_text: longText, url: 'https://twitter.com/u/status/1', user: { screen_name: 'u' }, retweet_count: 0, favorite_count: 0, views_count: 0, reply_count: 0 };
    const post = scraper.mapResult(item);
    expect(post!.title.length).toBeLessThanOrEqual(103);
  });

  it('returns null when url is missing', () => {
    const post = scraper.mapResult({ full_text: 'no url' });
    expect(post).toBeNull();
  });

  it('handles missing media gracefully', () => {
    const item = { full_text: 'no media', url: 'https://twitter.com/u/status/2', user: { screen_name: 'u' }, retweet_count: 0, favorite_count: 0, views_count: 0, reply_count: 0 };
    const post = scraper.mapResult(item);
    expect(post!.thumbnail).toBeUndefined();
  });
});
