import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class EtolandScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml(
      'https://www.etoland.co.kr/bbs/board.php?bo_table=etohumor01',
      { eucKr: true, headers: { Referer: 'https://www.etoland.co.kr/' } },
    );

    const posts: ScrapedPost[] = [];

    $('a[href*="etohumor01"][href*="wr_id="]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const title = $(el).text().trim();
      if (!title || title.length < 3 || title.startsWith('※')) return;

      const url = href.startsWith('http')
        ? href
        : `https://www.etoland.co.kr/bbs/${href.replace(/^\.\.\/bbs\//, '')}`;

      if (title && url) {
        posts.push({ sourceKey: 'etoland', sourceName: '에토랜드', title, url });
      }
    });

    return posts.slice(0, 30);
  }
}
