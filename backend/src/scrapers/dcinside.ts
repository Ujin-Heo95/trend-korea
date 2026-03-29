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
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('a.main_log[section_code="realtime_best_p"]').each((_, el) => {
      const url = $(el).attr('href') ?? '';
      const title =
        $(el).find('strong.tit').text().trim() ||
        $(el).find('.besttxt p').text().trim();
      const thumbnail = $(el).find('img').first().attr('src') || undefined;

      if (title && url) {
        posts.push({
          sourceKey: 'dcinside',
          sourceName: 'DC인사이드',
          title,
          url,
          thumbnail,
        });
      }
    });

    return posts.slice(0, 30);
  }
}
