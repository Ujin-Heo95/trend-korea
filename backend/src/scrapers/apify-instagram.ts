import type { Pool } from 'pg';
import { ApifyBaseScraper } from './apify-base.js';
import type { ScrapedPost } from './types.js';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export class ApifyInstagramScraper extends ApifyBaseScraper {
  constructor(pool: Pool) {
    super(pool, 'apify/instagram-hashtag-scraper', {
      hashtags: ['한국', '핫플', '맛집', '서울'],
      resultsLimit: 30,
    });
  }

  mapResult(item: Record<string, unknown>): ScrapedPost | null {
    const url = String(item.url ?? '');
    if (!url) return null;

    const caption = String(item.caption ?? '');
    const likes = Number(item.likesCount ?? 0);
    const comments = Number(item.commentsCount ?? 0);

    return {
      sourceKey: 'apify_instagram_trending',
      sourceName: 'Instagram',
      title: truncate(caption, 100) || '(이미지 게시물)',
      url,
      thumbnail: item.displayUrl ? String(item.displayUrl) : undefined,
      author: item.ownerUsername ? String(item.ownerUsername) : undefined,
      viewCount: likes,
      commentCount: comments,
      publishedAt: item.timestamp ? new Date(String(item.timestamp)) : undefined,
      metadata: { platform: 'instagram', likes },
    };
  }
}
