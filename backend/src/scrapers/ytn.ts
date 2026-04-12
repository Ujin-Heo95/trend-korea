import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.ytn.co.kr/',
};

/**
 * YTN — section list page (사회: mcd=0103) is server-rendered, ~40 articles
 * Article URL format: https://www.ytn.co.kr/_ln/{mcd}_{join_key}
 */
export class YtnScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.ytn.co.kr/news/list.php?mcd=0103', {
      headers: HEADERS,
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const seen = new Set<string>();
    const posts: ScrapedPost[] = [];

    $('a[href*="ytn.co.kr/_ln/"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const m = href.match(/^(https?:\/\/www\.ytn\.co\.kr\/_ln\/[A-Z0-9_]+)/i);
      if (!m) return;
      const url = m[1].replace(/^http:/, 'https:');
      if (seen.has(url)) return;

      const title = $(el).text().replace(/\s+/g, ' ').trim();
      if (!title || title.length < 5) return;

      seen.add(url);
      posts.push({
        sourceKey: 'ytn',
        sourceName: 'YTN',
        title,
        url,
      });
    });

    return posts.slice(0, 30);
  }
}
