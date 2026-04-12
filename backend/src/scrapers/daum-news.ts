import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://news.daum.net/',
};

/**
 * Daum 뉴스 — news.daum.net home is server-rendered with ~30 article links
 * pointing to v.daum.net/v/{news_id}. The legacy RSS feed is dead.
 */
export class DaumNewsScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://news.daum.net/', {
      headers: HEADERS,
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const seen = new Set<string>();
    const posts: ScrapedPost[] = [];

    $('a[href*="v.daum.net/v/"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const m = href.match(/^(https?:\/\/v\.daum\.net\/v\/\d+)/);
      if (!m) return;
      const url = m[1].replace(/^http:/, 'https:');
      if (seen.has(url)) return;

      const title = $(el).text().replace(/\s+/g, ' ').trim();
      if (!title || title.length < 5) return;

      seen.add(url);
      posts.push({
        sourceKey: 'daum_news',
        sourceName: '다음 뉴스',
        title,
        url,
      });
    });

    return posts.slice(0, 30);
  }
}
