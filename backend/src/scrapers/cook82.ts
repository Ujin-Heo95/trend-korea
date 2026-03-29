import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class Cook82Scraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.82cook.com/entiz/enti.php?bn=15', {
      headers: { Referer: 'https://www.82cook.com/' },
    });

    const posts: ScrapedPost[] = [];

    $('a[href*="read.php"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const title = $(el).text().trim();
      if (!title || title.length < 3) return;

      const url = href.startsWith('http')
        ? href
        : `https://www.82cook.com/entiz/${href.replace(/^\.\.\//, '')}`;

      if (title && url) {
        posts.push({ sourceKey: 'cook82', sourceName: '82쿡', title, url });
      }
    });

    return posts.slice(0, 30);
  }
}
