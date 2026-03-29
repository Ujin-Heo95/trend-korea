import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class YgosuScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.ygosu.com/community/best_article/', {
      headers: { Referer: 'https://www.ygosu.com/' },
    });

    const posts: ScrapedPost[] = [];

    $('a[href*="/board/best_article/"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (href.includes('/notice/') || href.includes('/ad/')) return;

      const rawTitle = $(el).text().trim();
      const title = rawTitle.replace(/\s*\(\d+\)\s*$/, '').trim();
      if (!title || title.length < 5) return;

      const commentMatch = rawTitle.match(/\((\d+)\)\s*$/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
      const url = href.startsWith('http') ? href : `https://www.ygosu.com${href}`;

      if (title && url) {
        posts.push({ sourceKey: 'ygosu', sourceName: '와이고수', title, url, commentCount });
      }
    });

    return posts.slice(0, 30);
  }
}
