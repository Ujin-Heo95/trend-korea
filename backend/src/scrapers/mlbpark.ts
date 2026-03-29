import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class MlbparkScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://mlbpark.donga.com/mp/b.php?b=bullpen&m=bbs', {
      headers: { Referer: 'https://mlbpark.donga.com/' },
    });

    const posts: ScrapedPost[] = [];

    $('a[href*="b=bullpen"][href*="m=view"]').each((_, el) => {
      const title = $(el).text().trim();
      const href = $(el).attr('href') ?? '';
      if (!title || title.length < 5) return;

      if (title && href) {
        posts.push({ sourceKey: 'mlbpark', sourceName: 'MLB파크', title, url: href });
      }
    });

    return posts.slice(0, 30);
  }
}
