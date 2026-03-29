import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class TodayhumorScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get(
      'https://www.todayhumor.co.kr/board/list.php?table=humorbest',
      { headers: UA, timeout: 15000 },
    );
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('td.subject a[href*="view.php"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (!href.includes('table=humorbest')) return;

      const title = $(el).text().trim();
      const url = href.startsWith('http') ? href : `https://www.todayhumor.co.kr${href}`;

      if (title && url) {
        posts.push({ sourceKey: 'todayhumor', sourceName: '오늘의유머', title, url });
      }
    });

    return posts.slice(0, 30);
  }
}
