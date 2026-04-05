import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import type { YouTubeVideoItem } from '../db/types.js';

export class YoutubeScraper extends BaseScraper {
  constructor(pool: Pool, private apiKey: string) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!this.apiKey) return [];

    try {
      const { data } = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'snippet,statistics,contentDetails',
          chart: 'mostPopular',
          regionCode: 'KR',
          maxResults: 20,
          key: this.apiKey,
        },
        timeout: 10000,
      });

      return (data.items ?? []).map((item: YouTubeVideoItem) => ({
        sourceKey: 'youtube',
        sourceName: 'YouTube',
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id}`,
        thumbnail: item.snippet.thumbnails?.medium?.url,
        author: item.snippet.channelTitle,
        contentSnippet: item.snippet.description?.slice(0, 500)?.trim() || undefined,
        viewCount: parseInt(item.statistics?.viewCount ?? '0'),
        commentCount: parseInt(item.statistics?.commentCount ?? '0'),
        likeCount: parseInt(item.statistics?.likeCount ?? '0'),
        publishedAt: item.snippet.publishedAt ? new Date(item.snippet.publishedAt) : undefined,
        metadata: {
          duration: item.contentDetails?.duration,
          definition: item.contentDetails?.definition,
          categoryId: item.snippet.categoryId,
          tags: item.snippet.tags?.slice(0, 10),
        },
      }));
    } catch (error) {
      throw new Error(`[youtube] ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
}
