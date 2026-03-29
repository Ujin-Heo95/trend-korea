import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class ClienScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.clien.net/service/board/park', {
      headers: { Referer: 'https://www.clien.net/' },
    });

    const posts: ScrapedPost[] = [];

    $('a.list_subject').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (!href || href.includes('/rule/') || href.includes('/annonce/')) return;

      const title = $(el).find('.subject_fixed').text().trim() || $(el).text().trim();
      const url = href.startsWith('http') ? href : `https://www.clien.net${href.split('?')[0]}`;
      const hit = $(el).closest('.list_item').find('.hit').text().trim();
      const viewCount = parseHit(hit);

      if (title && url) {
        posts.push({ sourceKey: 'clien', sourceName: '클리앙', title, url, viewCount });
      }
    });

    return posts.slice(0, 30);
  }
}

function parseHit(hit: string): number | undefined {
  if (!hit) return undefined;
  const num = hit.replace(/[, ]/g, '');
  if (num.endsWith('k')) return Math.round(parseFloat(num) * 1000);
  if (num.endsWith('M')) return Math.round(parseFloat(num) * 1_000_000);
  return parseInt(num) || undefined;
}
