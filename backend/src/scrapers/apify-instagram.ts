import type { Pool } from 'pg';
import { ApifyBaseScraper } from './apify-base.js';
import type { ScrapedPost } from './types.js';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

const MIN_LIKES = 100;

export class ApifyInstagramScraper extends ApifyBaseScraper {
  constructor(pool: Pool) {
    super(pool, 'apify/instagram-hashtag-scraper', {
      hashtags: ['핫플레이스', '서울핫플', '인스타핫플', '서울맛집'],
      resultsLimit: 30,
      resultsType: 'reels',
    });
  }

  mapResult(item: Record<string, unknown>): ScrapedPost | null {
    const url = String(item.url ?? '');
    if (!url) return null;

    const caption = String(item.caption ?? '');
    const likes = Number(item.likesCount ?? 0);
    const comments = Number(item.commentsCount ?? 0);

    if (likes >= 0 && likes < MIN_LIKES) return null;

    return {
      sourceKey: 'apify_instagram_trending',
      sourceName: 'Instagram',
      title: truncate(caption, 100) || '(릴스)',
      url,
      thumbnail: item.displayUrl ? String(item.displayUrl) : undefined,
      author: item.ownerUsername ? String(item.ownerUsername) : undefined,
      viewCount: Number(item.videoPlayCount ?? item.videoViewCount ?? 0),
      commentCount: comments,
      likeCount: likes,
      publishedAt: item.timestamp ? new Date(String(item.timestamp)) : undefined,
      metadata: { platform: 'instagram', likes },
    };
  }
}
