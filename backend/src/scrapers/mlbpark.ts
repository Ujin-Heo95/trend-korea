import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate, guardFutureDate } from './http-utils.js';

export class MlbparkScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://mlbpark.donga.com/mp/b.php?b=bullpen&m=bbs', {
      headers: { Referer: 'https://mlbpark.donga.com/' },
    });

    const posts: ScrapedPost[] = [];

    $('table.tbl_type01 tbody tr').each((_, el) => {
      const a = $(el).find('.tit a[href*="m=view"]').first();
      const title = (a.attr('alt') ?? a.text()).trim();
      const href = a.attr('href') ?? '';
      if (!title || title.length < 5 || !href) return;

      const viewCount = parseInt($(el).find('.viewV').text().replace(/,/g, '')) || undefined;
      const commentMatch = $(el).find('.replycnt').text().match(/\[(\d+)\]/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;

      const author = $(el).find('.nick').text().trim() || undefined;
      const likeCount = parseInt($(el).find('td.recomm, .recomm').text().replace(/[^0-9]/g, '')) || undefined;

      const dateText = $(el).find('.date').text().trim() || $(el).find('td').eq(4).text().trim();
      const publishedAt = guardFutureDate(parseKoreanDate(dateText));
      posts.push({ sourceKey: 'mlbpark', sourceName: 'MLB파크', title, url: href, author, viewCount, commentCount, likeCount, publishedAt });
    });

    return posts.slice(0, 30);
  }
}
