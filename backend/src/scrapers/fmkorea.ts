import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

export class FmkoreaScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.fmkorea.com/index.php?mid=best', {
      headers: {
        Referer: 'https://www.fmkorea.com/',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      delay: [1500, 3500],
    });

    const posts: ScrapedPost[] = [];

    $('li.li').each((_, el) => {
      const $el = $(el);
      const a = $el.find('h3.title a').first();
      const href = a.attr('href') ?? '';
      if (!href) return;

      const rawTitle = a.text().trim();
      const title = rawTitle.replace(/\s*\[\d+\]\s*$/, '').trim();
      const commentMatch = rawTitle.match(/\[(\d+)\]\s*$/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
      const url = href.startsWith('http') ? href : `https://www.fmkorea.com${href}`;
      const likeCount = parseInt($el.find('.ed .vr').text().replace(/,/g, '')) || undefined;
      const thumbnail = $el.find('.thumbnail img').attr('src') || undefined;

      const viewText = $el.find('.count').text().replace(/,/g, '').trim();
      const viewCount = parseInt(viewText) || undefined;
      const dateText = $el.find('.regdate, .date').text().trim();
      const publishedAt = parseKoreanDate(dateText);
      if (title && url) {
        posts.push({ sourceKey: 'fmkorea', sourceName: '에펨코리아', title, url, thumbnail, viewCount, commentCount, likeCount, publishedAt });
      }
    });

    return posts.slice(0, 30);
  }
}
