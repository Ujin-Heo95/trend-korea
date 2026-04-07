import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

export class RuliwebScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://bbs.ruliweb.com/best/now', {
      headers: {
        Referer: 'https://bbs.ruliweb.com/',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      delay: [1500, 3000],
      timeout: 20000,
    });

    const posts: ScrapedPost[] = [];

    $('tr.table_body').each((_, row) => {
      const $row = $(row);
      const $link = $row.find('td.subject a.subject_link');
      const href = $link.attr('href') ?? '';
      if (!href || href.includes('/market')) return;

      const title =
        $link.find('strong.text_over').text().trim() ||
        $link.find('span.text_over').text().trim();
      if (!title) return;

      const url = href.startsWith('http') ? href : `https://bbs.ruliweb.com${href}`;
      const author = $row.find('td.writer').text().trim() || undefined;
      const viewCount = parseInt($row.find('td.hit').text().trim(), 10) || 0;
      const replyText = $link.find('span.num_reply').text().trim();
      const commentCount = parseInt(replyText.replace(/[()]/g, ''), 10) || 0;
      const likeCount = parseInt($row.find('td.recomd').text().trim(), 10) || undefined;

      const dateText = $row.find('td.time').text().trim();
      const publishedAt = parseKoreanDate(dateText);
      posts.push({
        sourceKey: 'ruliweb',
        sourceName: '루리웹',
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
