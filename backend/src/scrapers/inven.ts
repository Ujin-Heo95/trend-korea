import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

export class InvenScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.inven.co.kr/board/it/2652', {
      headers: { Referer: 'https://www.inven.co.kr/' },
    });

    const posts: ScrapedPost[] = [];

    $('tr:has(a.subject-link)').each((_, el) => {
      const a = $(el).find('a.subject-link').first();
      const href = a.attr('href') ?? '';
      const title = a.text().replace(/\[.*?\]/g, '').trim().replace(/\s+/g, ' ');
      if (!title || title.length < 3) return;

      const url = href.startsWith('http') ? href : `https://www.inven.co.kr${href}`;
      const commentMatch = $(el).find('.con-comment').text().match(/\[(\d+)\]/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
      const author = $(el).find('td.user .layerNickName, td.user span').last().text().trim() || undefined;
      const viewCount = parseInt($(el).find('td.view').text().replace(/,/g, '')) || undefined;
      const likeCount = parseInt($(el).find('td.reco').text().replace(/,/g, '')) || undefined;

      const dateText = $(el).find('td.date').text().trim();
      const publishedAt = parseKoreanDate(dateText);
      posts.push({ sourceKey: 'inven', sourceName: '인벤', title, url, author, viewCount, commentCount, likeCount, publishedAt });
    });

    return posts.slice(0, 30);
  }
}
