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

    $('tr:has(td.tit a[href*="/board/best_article/"])').each((_, el) => {
      const a = $(el).find('td.tit a[href*="/board/best_article/"]').first();
      const href = a.attr('href') ?? '';
      if (href.includes('/notice/') || href.includes('/ad/')) return;

      const linkText = a.text().trim();
      const title = linkText.replace(/\s*\(\d+\)\s*$/, '').trim();
      if (!title || title.length < 5) return;

      const url = href.startsWith('http') ? href : `https://www.ygosu.com${href}`;
      const commentMatch = $(el).find('.reply_cnt').text().match(/\((\d+)\)/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
      const author = $(el).find('td.name a').text().trim() || undefined;
      const viewCount = parseInt($(el).find('td.view').text().replace(/,/g, '')) || undefined;
      const voteText = $(el).find('td.vote').text().trim();
      const likeCount = parseInt(voteText.replace(/[^0-9]/g, '')) || undefined;

      posts.push({ sourceKey: 'ygosu', sourceName: '와이고수', title, url, author, viewCount, commentCount, likeCount });
    });

    return posts.slice(0, 30);
  }
}
