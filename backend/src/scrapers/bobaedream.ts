import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class BobaedreamScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.bobaedream.co.kr/list?code=freeb', {
      headers: UA,
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('tr.best a.bsubject').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (!href.includes('code=freeb')) return;

      const title = ($(el).attr('title') ?? $(el).text()).trim();
      const url = href.startsWith('http') ? href : `https://www.bobaedream.co.kr${href}`;
      const author = $(el).closest('tr').find('.author').text().trim() || undefined;
      const commentText = $(el).closest('td').find('.totreply').first().text().trim();
      const commentCount = parseInt(commentText) || undefined;

      if (title && url) {
        posts.push({
          sourceKey: 'bobaedream',
          sourceName: '보배드림',
          title,
          url,
          author,
          commentCount,
        });
      }
    });

    return posts.slice(0, 30);
  }
}
