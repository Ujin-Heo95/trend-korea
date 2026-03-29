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

    $('tbody tr').each((_, el) => {
      const subjectTd = $(el).find('td.subject');
      const a = subjectTd.find('a[href^="/talk/"]').filter((_, link) => {
        const href = $(link).attr('href') ?? '';
        return /^\/talk\/\d+/.test(href);
      }).first();
      const href = (a.attr('href') ?? '').replace(/#.*$/, '').replace(/\?page=\d+/, '');
      if (!href) return;
      const title = (a.attr('title') ?? a.text()).trim();
      const url = `https://pann.nate.com${href}`;

      const tds = $(el).find('td');
      const viewCount = parseInt(tds.eq(2).text().replace(/,/g, '')) || undefined;
      const commentMatch = subjectTd.find('.reple-num').text().match(/\((\d+)\)/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;

      if (title && href) {
        posts.push({ sourceKey: 'natepann', sourceName: '네이트판', title, url, viewCount, commentCount });
      }
    });

    return posts.slice(0, 30);
  }
}
