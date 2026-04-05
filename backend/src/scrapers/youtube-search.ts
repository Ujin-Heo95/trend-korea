import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import type { YouTubeSearchItem } from '../db/types.js';
import { logger } from '../utils/logger.js';

const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2시간
const MAX_KEYWORDS = 10;
const KEYWORDS_PER_QUERY = 3;
const MAX_QUERIES = 3;
const MAX_RESULTS_PER_QUERY = 5;

export class YoutubeSearchScraper extends BaseScraper {
  constructor(pool: Pool, private apiKey: string) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!this.apiKey) {
      logger.warn('[youtube-search] API key missing — skipping');
      return [];
    }

    const shouldRun = await this.checkCooldown();
    if (!shouldRun) return [];

    let keywords = await this.getTopKeywords();
    if (!keywords.length) {
      logger.warn('[youtube-search] no trend keywords — using fallback');
      keywords = await this.getFallbackKeywords();
      if (!keywords.length) return [];
    }

    const groups = chunk(keywords, KEYWORDS_PER_QUERY).slice(0, MAX_QUERIES);
    const results: ScrapedPost[] = [];
    const seenUrls = new Set<string>();

    for (const group of groups) {
      const videos = await this.searchVideos(group);
      for (const v of videos) {
        if (!seenUrls.has(v.url)) {
          seenUrls.add(v.url);
          results.push(v);
        }
      }
    }

    return results;
  }

  private async checkCooldown(): Promise<boolean> {
    try {
      const { rows } = await this.pool.query<{ started_at: Date }>(
        `SELECT started_at FROM scraper_runs
         WHERE source_key = 'youtube_search' AND error_message IS NULL
         ORDER BY started_at DESC LIMIT 1`
      );
      if (!rows.length) return true;
      return Date.now() - rows[0].started_at.getTime() > COOLDOWN_MS;
    } catch {
      return true;
    }
  }

  private async getTopKeywords(): Promise<string[]> {
    const { rows } = await this.pool.query<{ keyword: string }>(
      `SELECT keyword FROM trend_keywords
       WHERE expires_at > NOW()
       ORDER BY signal_strength DESC LIMIT $1`,
      [MAX_KEYWORDS]
    );
    return rows.map(r => r.keyword);
  }

  /** trend_keywords가 비었을 때 최근 인기 포스트 제목에서 키워드 추출 */
  private async getFallbackKeywords(): Promise<string[]> {
    try {
      const { rows } = await this.pool.query<{ title: string }>(
        `SELECT DISTINCT title FROM posts
         WHERE scraped_at > NOW() - INTERVAL '6 hours'
           AND category IN ('community', 'news')
         ORDER BY title
         LIMIT 200`
      );
      if (!rows.length) return [];

      const stopWords = new Set(['것이', '하는', '있는', '그리고', '하지만', '때문', '이번', '오늘', '내일', '최근', '현재', '대한', '관련', '이상', '이하', '이후', '이전']);
      const freq = new Map<string, number>();
      for (const { title } of rows) {
        const words = title.match(/[가-힣]{2,}/g) ?? [];
        for (const w of words) {
          if (w.length < 2 || stopWords.has(w)) continue;
          freq.set(w, (freq.get(w) ?? 0) + 1);
        }
      }

      return [...freq.entries()]
        .filter(([, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_KEYWORDS)
        .map(([word]) => word);
    } catch {
      return [];
    }
  }

  private async searchVideos(keywords: string[]): Promise<ScrapedPost[]> {
    const query = keywords.join(' | ');
    const publishedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          regionCode: 'KR',
          relevanceLanguage: 'ko',
          publishedAfter,
          maxResults: MAX_RESULTS_PER_QUERY,
          key: this.apiKey,
        },
        timeout: 10000,
      });

      return (data.items ?? []).map((item: YouTubeSearchItem) => ({
        sourceKey: 'youtube_search',
        sourceName: 'YouTube 키워드',
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnail: item.snippet.thumbnails?.medium?.url,
        author: item.snippet.channelTitle,
        contentSnippet: item.snippet.description?.slice(0, 500)?.trim() || undefined,
        publishedAt: item.snippet.publishedAt ? new Date(item.snippet.publishedAt) : undefined,
        metadata: { searchKeywords: keywords },
      }));
    } catch (error) {
      logger.warn({ err: error, query }, '[youtube-search] search failed');
      return [];
    }
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
