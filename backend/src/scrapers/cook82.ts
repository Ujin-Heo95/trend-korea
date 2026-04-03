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
    const seenUrls = new Set<string>();

    $('a[href*="read.php"]:not(.photolink)').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const title = $(el).text().trim();
      if (!title || title.length < 3) return;
      // 숫자만으로 구성된 제목은 비게시글 링크
      if (/^\d+$/.test(title)) return;

      let url: string;
      if (href.startsWith('http')) {
        url = href;
      } else if (href.startsWith('/')) {
        url = `https://www.82cook.com${href}`;
      } else {
        url = `https://www.82cook.com/entiz/${href.replace(/^\.\.\//, '')}`;
      }

      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        posts.push({ sourceKey: 'cook82', sourceName: '82쿡', title, url });
      }
    });

    return posts.slice(0, 30);
  }
}
