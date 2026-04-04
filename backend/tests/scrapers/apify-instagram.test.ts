import { describe, it, expect } from 'vitest';
import { ApifyInstagramScraper } from '../../src/scrapers/apify-instagram.js';
import type { Pool } from 'pg';

describe('ApifyInstagramScraper.mapResult', () => {
  const pool = {} as Pool;
  const scraper = new ApifyInstagramScraper(pool);

  it('maps a standard Instagram post', () => {
    const item = {
      caption: '서울 핫플 카페 추천 #서울카페 #핫플',
      url: 'https://www.instagram.com/p/ABC123/',
      displayUrl: 'https://scontent.cdninstagram.com/v/photo.jpg',
      ownerUsername: 'foodie_kr',
      likesCount: 1234,
      commentsCount: 56,
      timestamp: '2026-03-31T09:00:00.000Z',
    };
    const post = scraper.mapResult(item);
    expect(post).not.toBeNull();
    expect(post!.sourceKey).toBe('apify_instagram_trending');
    expect(post!.sourceName).toBe('Instagram');
    expect(post!.title).toBe('서울 핫플 카페 추천 #서울카페 #핫플');
    expect(post!.url).toBe('https://www.instagram.com/p/ABC123/');
    expect(post!.thumbnail).toBe('https://scontent.cdninstagram.com/v/photo.jpg');
    expect(post!.author).toBe('foodie_kr');
    expect(post!.viewCount).toBe(0);
    expect(post!.commentCount).toBe(56);
    expect(post!.likeCount).toBe(1234);
    expect(post!.metadata).toEqual({ platform: 'instagram', likes: 1234 });
  });

  it('truncates long captions to 100 chars', () => {
    const longCaption = '가'.repeat(150);
    const item = { caption: longCaption, url: 'https://www.instagram.com/p/XYZ/', ownerUsername: 'user', likesCount: 200, commentsCount: 0 };
    const post = scraper.mapResult(item);
    expect(post!.title.length).toBeLessThanOrEqual(103);
  });

  it('returns null when url is missing', () => {
    const post = scraper.mapResult({ caption: 'no url', likesCount: 0, commentsCount: 0 });
    expect(post).toBeNull();
  });

  it('uses fallback title for empty caption', () => {
    const post = scraper.mapResult({ caption: '', url: 'https://www.instagram.com/p/1/', likesCount: 200, commentsCount: 0 });
    expect(post!.title).toBe('(릴스)');
  });

  it('filters out low-engagement posts', () => {
    const post = scraper.mapResult({ caption: '스팸', url: 'https://www.instagram.com/p/2/', likesCount: 10, commentsCount: 0 });
    expect(post).toBeNull();
  });
});
