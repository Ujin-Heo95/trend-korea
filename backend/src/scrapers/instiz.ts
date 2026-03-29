import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class InstizScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.instiz.net/pt', { headers: UA, timeout: 15000 });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('a[href^="https://www.instiz.net/pt/"]').each((_, el) => {
      const sbj = $(el).find('.sbj');
      if (!sbj.length) return;

      const url = $(el).attr('href') ?? '';
      const title = sbj.text().trim();
      const viewText = $(el).find('.listno').text();
      const viewMatch = viewText.match(/조회\s+([\d,]+)/);
      const viewCount = viewMatch ? parseInt(viewMatch[1].replace(/,/g, '')) : undefined;

      if (title && url) {
        posts.push({ sourceKey: 'instiz', sourceName: '인스티즈', title, url, viewCount });
      }
    });

    return posts.slice(0, 30);
  }
}
