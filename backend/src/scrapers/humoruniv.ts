import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class HumorunivScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml(
      'https://web.humoruniv.com/board/humor/list.html?table=pds&st=day',
      { eucKr: true },
    );

    const posts: ScrapedPost[] = [];

    $('a[href*="number="]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (!href.includes('table=pds')) return;

      const title = $(el).text().trim();
      if (!title || title.length < 3) return;

      const url = href.startsWith('http')
        ? href
        : `https://web.humoruniv.com${href.startsWith('/') ? '' : '/board/humor/'}${href}`;

      if (title && url) {
        posts.push({ sourceKey: 'humoruniv', sourceName: '웃긴대학', title, url });
      }
    });

    return posts.slice(0, 30);
  }
}
