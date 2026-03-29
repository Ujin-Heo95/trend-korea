import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class SlrclubScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.slrclub.com/bbs/zboard.php?id=hot_article', {
      headers: { Referer: 'https://www.slrclub.com/' },
    });

    const posts: ScrapedPost[] = [];

    $('a[href*="vx2.php"][href*="hot_article"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const title = $(el).text().trim();
      if (!title || title.length < 3) return;

      const url = href.startsWith('http')
        ? href
        : `https://www.slrclub.com${href.startsWith('/') ? '' : '/bbs/'}${href}`;

      if (title && url) {
        posts.push({ sourceKey: 'slrclub', sourceName: 'SLR클럽', title, url });
      }
    });

    return posts.slice(0, 30);
  }
}
