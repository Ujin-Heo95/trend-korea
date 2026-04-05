import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

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
      const listItem = $(el).closest('.list_item');
      const hit = listItem.find('.hit').text().trim();
      const viewCount = parseHit(hit);
      const likeCount = parseInt(listItem.find('.symph_count, .list_symph .num').text().trim()) || undefined;
      const thumbnail = listItem.find('.list_image img').attr('src') || undefined;

      const replyText = listItem.find('.reply_symph .rSymph05, .list_reply .num').text().trim();
      const commentCount = parseInt(replyText) || undefined;
      const dateText = listItem.find('.timestamp').text().trim() || listItem.find('.time').text().trim();
      const publishedAt = parseKoreanDate(dateText);
      if (title && url) {
        posts.push({ sourceKey: 'clien', sourceName: '클리앙', title, url, thumbnail, viewCount, commentCount, likeCount, publishedAt });
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
