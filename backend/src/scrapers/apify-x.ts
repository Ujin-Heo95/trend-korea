import type { Pool } from 'pg';
import { ApifyBaseScraper } from './apify-base.js';
import type { ScrapedPost } from './types.js';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

const MIN_LIKES = 50;

export class ApifyXScraper extends ApifyBaseScraper {
  constructor(pool: Pool) {
    super(pool, 'apidojo/tweet-scraper', {
      searchTerms: ['한국 트렌드'],
      maxTweets: 30,
      language: 'ko',
    });
  }

  mapResult(item: Record<string, unknown>): ScrapedPost | null {
    const url = String(item.url ?? '');
    if (!url) return null;

    const text = String(item.full_text ?? item.text ?? '');
    const user = item.user as Record<string, unknown> | undefined;
    const screenName = user?.screen_name ? String(user.screen_name) : undefined;
    const retweets = Number(item.retweet_count ?? 0);
    const likes = Number(item.favorite_count ?? 0);
    const views = Number(item.views_count ?? 0);
    const replies = Number(item.reply_count ?? 0);

    if (likes < MIN_LIKES) return null;

    const entities = item.entities as Record<string, unknown> | undefined;
    const media = Array.isArray(entities?.media) ? entities.media : [];
    const thumbnail = media.length > 0 ? String((media[0] as any).media_url_https ?? '') : undefined;

    return {
      sourceKey: 'apify_x_trending',
      sourceName: 'X (Twitter)',
      title: truncate(text, 100) || '(트윗)',
      url,
      thumbnail: thumbnail || undefined,
      author: screenName ? `@${screenName}` : undefined,
      viewCount: views,
      commentCount: replies,
      likeCount: likes,
      publishedAt: item.created_at ? new Date(String(item.created_at)) : undefined,
      metadata: { platform: 'x', retweets, likes },
    };
  }
}
