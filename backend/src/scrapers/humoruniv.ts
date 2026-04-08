import type { Pool } from 'pg';
import pLimit from 'p-limit';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

const DETAIL_LIMIT = pLimit(3);

export class HumorunivScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml(
      'https://web.humoruniv.com/board/humor/list.html?table=pds&st=day',
      { eucKr: true },
    );

    const posts: ScrapedPost[] = [];

    $('tr[id^="li_chk_pds-"]').each((_, el) => {
      const a = $(el).find('td.li_sbj a[href*="number="]').first();
      const href = a.attr('href') ?? '';
      if (!href.includes('table=pds') && !href.includes('number=')) return;

      const titleSpan = a.find('span[id^="title_chk_"]');
      const title = (titleSpan.length ? titleSpan.text() : a.text()).trim().replace(/\s+/g, ' ').replace(/\[.*?\]/g, '').replace(/추천추천.*$/, '').trim();
      if (!title || title.length < 3) return;

      const url = href.startsWith('http')
        ? href
        : `https://web.humoruniv.com${href.startsWith('/') ? '' : '/board/humor/'}${href}`;

      const commentMatch = $(el).find('.list_comment_num').text().match(/\[(\d+)\]/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
      const thumbnail = $(el).find('td.li_num img.thumb').attr('src') || undefined;

      const recText = $(el).find('td.li_sbj span').last().text();
      const recMatch = recText.match(/\+\s*([\d,]+)/);
      const likeCount = recMatch ? parseInt(recMatch[1].replace(/,/g, '')) : undefined;
      const dateText = $(el).find('td.li_date').text().trim() || $(el).find('td.date').text().trim();
      const publishedAt = parseKoreanDate(dateText);
      posts.push({ sourceKey: 'humoruniv', sourceName: '웃긴대학', title, url, thumbnail, commentCount, likeCount, publishedAt });
    });

    // Fallback: 행 구조가 다를 경우 기존 방식
    if (posts.length === 0) {
      $('a[href*="number="]').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        if (!href.includes('table=pds')) return;
        const title = $(el).text().trim();
        if (!title || title.length < 3) return;
        const url = href.startsWith('http')
          ? href
          : `https://web.humoruniv.com${href.startsWith('/') ? '' : '/board/humor/'}${href}`;
        posts.push({ sourceKey: 'humoruniv', sourceName: '웃긴대학', title, url });
      });
    }

    const sliced = posts.slice(0, 30);

    // 2단계: 개별 글 페이지에서 조회수 보강 (EUC-KR)
    const enriched = await Promise.all(
      sliced.map(post => DETAIL_LIMIT(async () => {
        try {
          const detail$ = await fetchHtml(post.url, {
            eucKr: true,
            timeout: 10_000,
            delay: [300, 800],
          });
          const bodyText = detail$.text();
          const viewMatch = bodyText.match(/조회\s+([\d,]+)/);
          return {
            ...post,
            viewCount: viewMatch ? parseInt(viewMatch[1].replace(/,/g, '')) : undefined,
          };
        } catch {
          return post;
        }
      })),
    );

    return enriched;
  }
}
