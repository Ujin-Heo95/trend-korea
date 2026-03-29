import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class InvenScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.inven.co.kr/board/it/2652', {
      headers: { Referer: 'https://www.inven.co.kr/' },
    });

    const posts: ScrapedPost[] = [];

    $('a.subject-link').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const title = $(el).text().trim().replace(/\s+/g, ' ');
      if (!title || title.length < 3) return;

      const url = href.startsWith('http') ? href : `https://www.inven.co.kr${href}`;

      if (title && url) {
        posts.push({ sourceKey: 'inven', sourceName: '인벤', title, url });
      }
    });

    return posts.slice(0, 30);
  }
}
