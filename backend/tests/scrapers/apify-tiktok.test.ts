import { describe, it, expect } from 'vitest';
import { ApifyTiktokScraper } from '../../src/scrapers/apify-tiktok.js';
import type { Pool } from 'pg';

describe('ApifyTiktokScraper.mapResult', () => {
  const pool = {} as Pool;
  const scraper = new ApifyTiktokScraper(pool);

  it('maps a standard TikTok video', () => {
    const item = {
      text: '한국 길거리 음식 먹방',
      webVideoUrl: 'https://www.tiktok.com/@user/video/123',
      videoMeta: { coverUrl: 'https://p16-sign.tiktokcdn.com/cover.jpg' },
      authorMeta: { name: 'foodie_seoul' },
      playCount: 150000,
      commentCount: 340,
      diggCount: 8900,
      shareCount: 1200,
      createTimeISO: '2026-03-31T09:00:00.000Z',
    };
    const post = scraper.mapResult(item);
    expect(post).not.toBeNull();
    expect(post!.sourceKey).toBe('apify_tiktok_trending');
    expect(post!.sourceName).toBe('TikTok');
    expect(post!.url).toBe('https://www.tiktok.com/@user/video/123');
    expect(post!.author).toBe('foodie_seoul');
    expect(post!.viewCount).toBe(150000);
    expect(post!.commentCount).toBe(340);
    expect(post!.metadata).toEqual({ platform: 'tiktok', likes: 8900, shares: 1200 });
  });

  it('returns null when url is missing', () => {
    const post = scraper.mapResult({ text: 'no url' });
    expect(post).toBeNull();
  });

  it('uses fallback title for empty text', () => {
    const post = scraper.mapResult({ text: '', webVideoUrl: 'https://tiktok.com/1', playCount: 0, commentCount: 0 });
    expect(post!.title).toBe('(TikTok 영상)');
  });
});
