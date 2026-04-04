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

    $('tr.view').each((_, el) => {
      const a = $(el).find('td.subject a[href*="view.php"]').first();
      const href = a.attr('href') ?? '';
      if (!href.includes('table=humorbest')) return;

      const title = a.text().trim();
      const url = href.startsWith('http') ? href : `https://www.todayhumor.co.kr${href}`;
      const viewCount = parseInt($(el).find('td.hits').text().replace(/,/g, '')) || undefined;
      const memoText = $(el).find('.list_memo_count_span').text().trim();
      const memoMatch = memoText.match(/(\d+)/);
      const commentCount = memoMatch ? parseInt(memoMatch[1]) || undefined : undefined;
      const likeCount = parseInt($(el).find('td.oknok .ok_ok').text().replace(/,/g, '')) || undefined;

      if (title && url) {
        posts.push({ sourceKey: 'todayhumor', sourceName: '오늘의유머', title, url, viewCount, commentCount, likeCount });
      }
    });

    return posts.slice(0, 30);
  }
}
