import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class InstizScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.instiz.net/pt', { headers: UA, timeout: 10000 });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];
    $('.board_list tbody tr').each((_, el) => {
      const a = $(el).find('a.listsubject').first();
      const title = a.text().trim();
      const href = a.attr('href') ?? '';
      const url = href.startsWith('http') ? href : `https://www.instiz.net${href}`;
      if (title && url && url !== 'https://www.instiz.net') {
        posts.push({ sourceKey: 'instiz', sourceName: '인스티즈', title, url });
      }
    });
    return posts.slice(0, 30);
  }
}
