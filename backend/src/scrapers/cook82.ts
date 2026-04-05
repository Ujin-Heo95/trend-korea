import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

export class Cook82Scraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.82cook.com/entiz/enti.php?bn=15', {
      headers: { Referer: 'https://www.82cook.com/' },
    });

    const posts: ScrapedPost[] = [];
    const seenUrls = new Set<string>();

    $('#bbs table tbody tr:not(.noticeList)').each((_, el) => {
      const a = $(el).find('td.title a[href*="read.php"]').first();
      const href = a.attr('href') ?? '';
      const title = a.text().trim();
      if (!title || title.length < 3) return;
      if (/^\d+$/.test(title)) return;

      let url: string;
      if (href.startsWith('http')) {
        url = href;
      } else if (href.startsWith('/')) {
        url = `https://www.82cook.com${href}`;
      } else {
        url = `https://www.82cook.com/entiz/${href.replace(/^\.\.\//, '')}`;
      }

      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      const author = $(el).find('td.user_function').text().trim() || undefined;
      const commentCount = parseInt($(el).find('td.title em').text()) || undefined;
      const cells = $(el).find('td.numbers:not(.regdate)');
      const viewCount = parseInt(cells.last().text().replace(/,/g, '')) || undefined;

      const likeCount = parseInt($(el).find('td.recomm, td.recommend').text().replace(/,/g, '')) || undefined;
      const dateText = $(el).find('td.regdate').text().trim();
      const publishedAt = parseKoreanDate(dateText);
      posts.push({ sourceKey: 'cook82', sourceName: '82쿡', title, url, author, viewCount, commentCount, likeCount, publishedAt });
    });

    return posts.slice(0, 30);
  }
}
