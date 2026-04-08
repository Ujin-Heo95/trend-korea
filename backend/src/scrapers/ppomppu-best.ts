import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

export class PpomppuBestScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml(
      'https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu&category=999',
      { eucKr: true },
    );

    const posts: ScrapedPost[] = [];

    $('tr.baseList').each((_, el) => {
      const tds = $(el).find('td');
      if (tds.length < 6) return;

      const titleTd = tds.eq(1);
      const a = titleTd.find('a[href*="view.php"]').first();
      const href = a.attr('href') ?? '';
      if (!href) return;

      const title = a.find('font').text().trim() || a.text().trim();
      if (!title || title.length < 3) return;

      const url = href.startsWith('http')
        ? href
        : `https://www.ppomppu.co.kr${href.startsWith('/') ? '' : '/zboard/'}${href}`;

      const commentMatch = titleTd.text().match(/(\d+)\s*$/);
      const commentSpan = titleTd.find('span').last().text().trim();
      const commentCount = parseInt(commentSpan) || (commentMatch ? parseInt(commentMatch[1]) : undefined);

      const voteText = tds.eq(4).text().trim();
      const voteParts = voteText.split('-').map(s => parseInt(s.trim()));
      const likeCount = voteParts[0] || undefined;

      const viewCount = parseInt(tds.eq(5).text().replace(/[^0-9]/g, '')) || undefined;

      const dateText = tds.eq(3).text().trim();
      const publishedAt = parseKoreanDate(dateText);

      const author = tds.eq(2).text().trim() || undefined;

      posts.push({
        sourceKey: 'ppomppu_best',
        sourceName: '뽐뿌',
        title,
        url,
        author,
        viewCount,
        commentCount,
        likeCount,
        publishedAt,
      });
    });

    return posts.slice(0, 30);
  }
}
