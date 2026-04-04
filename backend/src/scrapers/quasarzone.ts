import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class QuasarzoneScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://quasarzone.com/bbs/qb_saleinfo', {
      headers: { Referer: 'https://quasarzone.com/' },
    });

    const posts: ScrapedPost[] = [];

    $('.market-info-list').each((_, el) => {
      const a = $(el).find('a.subject-link').first();
      const href = a.attr('href') ?? '';
      if (!href) return;

      const title = a.find('.ellipsis-with-reply-cnt').text().trim() || a.text().trim();
      const url = href.startsWith('http') ? href : `https://quasarzone.com${href}`;
      const thumbStyle = $(el).find('.img-background-wrap').attr('style') ?? '';
      const thumbMatch = thumbStyle.match(/url\(([^)]+)\)/);
      const thumbnail = thumbMatch ? thumbMatch[1].replace(/['"]/g, '') : undefined;
      const viewText = $(el).find('.count').text().trim();
      const viewCount = parseInt(viewText.replace(/,/g, '')) || undefined;
      const commentMatch = title.match(/\[(\d+)\]$/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;

      if (title) {
        posts.push({
          sourceKey: 'quasarzone_deal',
          sourceName: '퀘사이사존 핫딜',
          title: title.replace(/\[\d+\]$/, '').trim(),
          url,
          thumbnail,
          viewCount,
          commentCount,
        });
      }
    });

    return posts.slice(0, 30);
  }
}
