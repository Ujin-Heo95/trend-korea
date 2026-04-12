import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.joongang.co.kr/',
};

export class JoongangScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.joongang.co.kr/', {
      headers: HEADERS,
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const seen = new Set<string>();
    const posts: ScrapedPost[] = [];

    $('a[href*="joongang.co.kr/article/"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const m = href.match(/^(https:\/\/www\.joongang\.co\.kr\/article\/\d+)/);
      if (!m) return;
      const url = m[1];
      if (seen.has(url)) return;

      const title = $(el).text().replace(/\s+/g, ' ').trim();
      if (!title || title.length < 5) return;

      seen.add(url);
      posts.push({
        sourceKey: 'joins',
        sourceName: '중앙일보',
        title,
        url,
      });
    });

    return posts.slice(0, 30);
  }
}
