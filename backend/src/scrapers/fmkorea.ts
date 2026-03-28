import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class FmkoreaScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.fmkorea.com/index.php?mid=best', { headers: UA, timeout: 10000 });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];
    $('ul.row li.li_best').each((_, el) => {
      const a = $(el).find('a.hotdeal_var8, a.title').first();
      const title = a.text().trim();
      const href = a.attr('href') ?? '';
      const url = href.startsWith('http') ? href : `https://www.fmkorea.com${href}`;
      const viewCount = parseInt($(el).find('.m_no').text().replace(/,/g, '')) || undefined;
      if (title && url) posts.push({ sourceKey: 'fmkorea', sourceName: '에펨코리아', title, url, viewCount });
    });
    return posts;
  }
}
