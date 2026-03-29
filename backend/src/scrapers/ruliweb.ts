import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class RuliwebScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://bbs.ruliweb.com/best/now', {
      headers: UA,
      timeout: 20000,
    });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('td.subject a.subject_link').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (href.startsWith('/market')) return;

      const title =
        $(el).find('strong.text_over').text().trim() ||
        $(el).find('span.text_over').text().trim();
      const url = `https://bbs.ruliweb.com${href}`;
      const author = $(el).closest('tr').find('td.writer').text().trim() || undefined;

      if (title && href) {
        posts.push({ sourceKey: 'ruliweb', sourceName: '루리웹', title, url, author });
      }
    });

    return posts.slice(0, 30);
  }
}
