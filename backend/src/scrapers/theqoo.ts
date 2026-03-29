import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class TheqooScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://theqoo.net/hot', { headers: UA, timeout: 10000 });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];
    $('table.bd_lst tbody tr').each((_, el) => {
      const a = $(el).find('td.title a').first();
      const title = a.text().trim();
      const href = a.attr('href') ?? '';
      const url = href.startsWith('http') ? href : `https://theqoo.net${href}`;
      const viewCount = parseInt($(el).find('.m_no').text().replace(/,/g, '')) || undefined;
      const commentText = $(el).find('.replyNum').text().trim();
      const commentCount = commentText ? parseInt(commentText.replace(/,/g, '')) || undefined : undefined;
      if (title && url && url !== 'https://theqoo.net') {
        posts.push({ sourceKey: 'theqoo', sourceName: '더쿠', title, url, viewCount, commentCount });
      }
    });
    return posts.slice(0, 30);
  }
}
