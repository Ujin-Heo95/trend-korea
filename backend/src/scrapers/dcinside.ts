import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.dcinside.com/',
};

export class DcinsideScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.dcinside.com/', {
      headers: HEADERS,
      timeout: 10000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('.best_box li').each((_, el) => {
      const a = $(el).find('a.besttit');
      const title = a.text().trim();
      const url = a.attr('href') ?? '';
      const author = $(el).find('.bestnick').text().trim() || undefined;
      const viewCount =
        parseInt($(el).find('.bestview').text().replace(/,/g, '')) || undefined;

      if (title && url) {
        posts.push({
          sourceKey: 'dcinside',
          sourceName: 'DC인사이드',
          title,
          url,
          author,
          viewCount,
        });
      }
    });

    return posts;
  }
}
