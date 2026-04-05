import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

export class SlrclubScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.slrclub.com/bbs/zboard.php?id=hot_article', {
      headers: { Referer: 'https://www.slrclub.com/' },
    });

    const posts: ScrapedPost[] = [];

    $('tr:has(td.sbj a[href*="vx2.php"][href*="hot_article"])').each((_, el) => {
      const a = $(el).find('td.sbj a[href*="vx2.php"]').first();
      const href = a.attr('href') ?? '';
      const title = a.text().trim();
      if (!title || title.length < 3) return;

      const url = href.startsWith('http')
        ? href
        : `https://www.slrclub.com${href.startsWith('/') ? '' : '/bbs/'}${href}`;

      const author = $(el).find('td.list_name span').text().trim() || undefined;
      const commentMatch = $(el).find('td.sbj').text().match(/\[(\d+)\]/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
      const viewCount = parseInt($(el).find('td.list_click').text().replace(/,/g, '')) || undefined;
      const likeCount = parseInt($(el).find('td.list_vote').text().replace(/,/g, '')) || undefined;

      const dateText = $(el).find('td.list_date').text().trim();
      const publishedAt = parseKoreanDate(dateText);
      posts.push({ sourceKey: 'slrclub', sourceName: 'SLR클럽', title, url, author, viewCount, commentCount, likeCount, publishedAt });
    });

    return posts.slice(0, 30);
  }
}
