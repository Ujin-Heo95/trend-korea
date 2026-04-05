import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class ClienJirumScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.clien.net/service/board/jirum', {
      headers: { Referer: 'https://www.clien.net/' },
    });

    const posts: ScrapedPost[] = [];

    $('a.list_subject').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (!href || href.includes('/rule/') || href.includes('/annonce/')) return;

      const title = $(el).text().trim();
      const url = href.startsWith('http') ? href : `https://www.clien.net${href.split('?')[0]}`;
      const listItem = $(el).closest('.list_item');
      const hit = listItem.find('.hit').text().trim();
      const viewCount = parseHit(hit);
      const likeCount = parseInt(listItem.find('.symph_count, .list_symph .num').text().trim()) || undefined;
      const thumbnail = listItem.find('.list_image img').attr('src') || undefined;

      if (title && url) {
        posts.push({ sourceKey: 'clien_jirum', sourceName: '클리앙 알뜰구매', title, url, thumbnail, viewCount, likeCount });
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
