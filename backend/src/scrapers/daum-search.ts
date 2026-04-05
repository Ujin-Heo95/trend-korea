import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import type { DaumSearchDoc } from '../db/types.js';
import { logger } from '../utils/logger.js';

const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2시간
const MAX_KEYWORDS = 5;
const MAX_RESULTS_PER_KEYWORD = 10;
const STOP_WORDS = new Set(['것이', '하는', '있는', '그리고', '하지만', '때문', '이번', '오늘', '내일', '최근', '현재', '대한', '관련', '이상', '이하', '이후', '이전']);

abstract class DaumSearchBase extends BaseScraper {
  protected abstract readonly searchType: 'cafe' | 'blog';
  protected abstract readonly sourceKey: string;
  protected abstract readonly sourceName: string;

  constructor(pool: Pool, private apiKey: string) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!this.apiKey) {
      logger.warn({ sourceKey: this.sourceKey }, '[daum-search] API key missing — skipping');
      return [];
    }

    const shouldRun = await this.checkCooldown();
    if (!shouldRun) return [];

    const keywords = await this.getTopKeywords();
    if (!keywords.length) {
      logger.warn({ sourceKey: this.sourceKey }, '[daum-search] no trend keywords — using fallback');
    }
    const effectiveKeywords = keywords.length > 0 ? keywords : await this.getFallbackKeywords();
    if (!effectiveKeywords.length) return [];

    const results: ScrapedPost[] = [];
    const seenUrls = new Set<string>();

    for (const keyword of effectiveKeywords) {
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
         WHERE source_key = $1 AND error_message IS NULL
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

      // 빈도수 기반 상위 키워드 추출 (2글자 이상 한글 단어)
      const freq = new Map<string, number>();
      for (const { title } of rows) {
        const words = title.match(/[가-힣]{2,}/g) ?? [];
        for (const w of words) {
          if (w.length < 2 || STOP_WORDS.has(w)) continue;
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
        contentSnippet: doc.contents ? stripHtml(doc.contents).slice(0, 500).trim() || undefined : undefined,
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
