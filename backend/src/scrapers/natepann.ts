import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class NatepannScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://pann.nate.com/talk/c20001', {
      headers: UA,
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('td.subject a[href^="/talk/"]').each((_, el) => {
      const href = ($(el).attr('href') ?? '').replace(/#.*$/, '').replace(/\?page=\d+/, '');
      if (!href) return;
      const title = ($(el).attr('title') ?? $(el).text()).trim();
      const url = `https://pann.nate.com${href}`;

      if (title && href) {
        posts.push({ sourceKey: 'natepann', sourceName: '네이트판', title, url });
      }
    });

    return posts.slice(0, 30);
  }
}
