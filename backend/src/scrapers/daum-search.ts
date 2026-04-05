import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import type { DaumSearchDoc } from '../db/types.js';
import { logger } from '../utils/logger.js';

const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2시간
const MAX_KEYWORDS = 5;
const MAX_RESULTS_PER_KEYWORD = 10;

abstract class DaumSearchBase extends BaseScraper {
  protected abstract readonly searchType: 'cafe' | 'blog';
  protected abstract readonly sourceKey: string;
  protected abstract readonly sourceName: string;

  constructor(pool: Pool, private apiKey: string) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!this.apiKey) return [];

    const shouldRun = await this.checkCooldown();
    if (!shouldRun) return [];

    const keywords = await this.getTopKeywords();
    if (!keywords.length) return [];

    const results: ScrapedPost[] = [];
    const seenUrls = new Set<string>();

    for (const keyword of keywords) {
      const posts = await this.search(keyword);
      for (const p of posts) {
        if (!seenUrls.has(p.url)) {
          seenUrls.add(p.url);
          results.push(p);
        }
      }
    }

    return results.slice(0, 30);
  }

  private async checkCooldown(): Promise<boolean> {
    try {
      const { rows } = await this.pool.query<{ started_at: Date }>(
        `SELECT started_at FROM scraper_runs
         WHERE source_key = $1 AND status = 'success'
         ORDER BY started_at DESC LIMIT 1`,
        [this.sourceKey]
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

  private async search(keyword: string): Promise<ScrapedPost[]> {
    try {
      const { data } = await axios.get(
        `https://dapi.kakao.com/v2/search/${this.searchType}`,
        {
          params: { query: keyword, sort: 'recency', size: MAX_RESULTS_PER_KEYWORD },
          headers: { Authorization: `KakaoAK ${this.apiKey}` },
          timeout: 10000,
        }
      );

      return (data.documents ?? []).map((doc: DaumSearchDoc) => ({
        sourceKey: this.sourceKey,
        sourceName: this.sourceName,
        title: stripHtml(doc.title),
        url: doc.url,
        thumbnail: doc.thumbnail || undefined,
        author: doc.cafename || doc.blogname || undefined,
        publishedAt: doc.datetime ? new Date(doc.datetime) : undefined,
        metadata: { searchKeywords: [keyword] },
      }));
    } catch (error) {
      logger.warn({ err: error, keyword }, `[${this.sourceKey}] search failed`);
      return [];
    }
  }
}

export class DaumCafeScraper extends DaumSearchBase {
  protected readonly searchType = 'cafe' as const;
  protected readonly sourceKey = 'daum_cafe';
  protected readonly sourceName = '다음 카페';
}

export class DaumBlogScraper extends DaumSearchBase {
  protected readonly searchType = 'blog' as const;
  protected readonly sourceKey = 'daum_blog';
  protected readonly sourceName = '다음 블로그';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[#\w]+;/g, ' ').trim();
}
