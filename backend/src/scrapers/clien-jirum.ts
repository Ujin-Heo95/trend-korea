import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

export class ClienJirumScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.clien.net/service/board/jirum', {
      headers: { Referer: 'https://www.clien.net/' },
    });

    const posts: ScrapedPost[] = [];

    // 게시글 링크: /service/board/jirum/{id} 패턴
    $('a[href*="/service/board/jirum/"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      // 공지/규칙 제외, 실제 게시글 ID가 있는 링크만
      if (!href || href.includes('/rule') || href.includes('/annonce') || !/\/jirum\/\d+/.test(href)) return;

      const title = $(el).text().trim();
      if (!title || title.length < 2) return;

      const url = href.startsWith('http') ? href : `https://www.clien.net${href.split('?')[0]}`;

      // 상위 리스트 아이템에서 메타데이터 추출
      const listItem = $(el).closest('.list_item, tr, li, div[class*="item"]');
      const hit = listItem.find('.hit, .view_count, .count').text().trim();
      const viewCount = parseHit(hit);
      const likeCount = parseInt(listItem.find('.symph_count, .list_symph .num, .like').text().trim()) || undefined;
      const commentText = listItem.find('.rp_count, .comment_count, .reply_symph').text().trim();
      const commentCount = parseInt(commentText.replace(/[[\]()]/g, '')) || undefined;
      const thumbnail = listItem.find('img[src*="clien"], img.list_image, .thumbnail img').attr('src') || undefined;
      const dateText = listItem.find('.timestamp, .regdate, .date, time').text().trim();
      const publishedAt = parseKoreanDate(dateText);

      if (title && url) {
        posts.push({ sourceKey: 'clien_jirum', sourceName: '클리앙 알뜰구매', title, url, thumbnail, viewCount, commentCount, likeCount, publishedAt });
      }
    });

    // URL 기준 중복 제거
    const seen = new Set<string>();
    const unique = posts.filter(p => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });

    return unique.slice(0, 30);
  }
}

function parseHit(hit: string): number | undefined {
  if (!hit) return undefined;
  const num = hit.replace(/[, ]/g, '');
  if (num.endsWith('k')) return Math.round(parseFloat(num) * 1000);
  if (num.endsWith('M')) return Math.round(parseFloat(num) * 1_000_000);
  return parseInt(num) || undefined;
}
