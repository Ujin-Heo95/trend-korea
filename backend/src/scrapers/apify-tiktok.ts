import type { Pool } from 'pg';
import { ApifyBaseScraper } from './apify-base.js';
import type { ScrapedPost } from './types.js';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export class ApifyTiktokScraper extends ApifyBaseScraper {
  constructor(pool: Pool) {
    super(pool, 'clockworks/tiktok-scraper', {
      hashtags: ['한국', '핫플', '맛집'],
      resultsPerPage: 30,
    });
  }

  mapResult(item: Record<string, unknown>): ScrapedPost | null {
    const url = String(item.webVideoUrl ?? '');
    if (!url) return null;

    const text = String(item.text ?? '');
    const authorMeta = item.authorMeta as Record<string, unknown> | undefined;
    const videoMeta = item.videoMeta as Record<string, unknown> | undefined;
    const likes = Number(item.diggCount ?? 0);
    const shares = Number(item.shareCount ?? 0);

    return {
      sourceKey: 'apify_tiktok_trending',
      sourceName: 'TikTok',
      title: truncate(text, 100) || '(TikTok 영상)',
      url,
      thumbnail: videoMeta?.coverUrl ? String(videoMeta.coverUrl) : undefined,
      author: authorMeta?.name ? String(authorMeta.name) : undefined,
      viewCount: Number(item.playCount ?? 0),
      commentCount: Number(item.commentCount ?? 0),
      publishedAt: item.createTimeISO ? new Date(String(item.createTimeISO)) : undefined,
      metadata: { platform: 'tiktok', likes, shares },
    };
  }
}
