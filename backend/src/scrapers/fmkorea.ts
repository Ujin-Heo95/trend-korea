import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class FmkoreaScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.fmkorea.com/index.php?mid=best', {
      headers: { Referer: 'https://www.fmkorea.com/' },
    });

    const posts: ScrapedPost[] = [];

    $('h3.title a').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (!href) return;

      const rawTitle = $(el).text().trim();
      const title = rawTitle.replace(/\s*\[\d+\]\s*$/, '').trim();
      const commentMatch = rawTitle.match(/\[(\d+)\]\s*$/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
      const url = href.startsWith('http') ? href : `https://www.fmkorea.com${href}`;

      if (title && url) {
        posts.push({ sourceKey: 'fmkorea', sourceName: '에펨코리아', title, url, commentCount });
      }
    });

    return posts.slice(0, 30);
  }
}
