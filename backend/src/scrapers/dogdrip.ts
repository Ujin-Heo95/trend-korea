import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

/**
 * 개드립 (dogdrip.net) 인기글 스크래퍼.
 *
 * Dogdrip은 Cloudflare 뒤에서 cloud IP를 적극 차단하므로
 * 반드시 브라우저와 동일한 Sec-Fetch-* 헤더를 포함해야 200을 받을 수 있다.
 * RSS 피드(/dogdrip/rss)는 403 차단 확인됨 (2026-04-07).
 */

const BROWSER_HEADERS: Record<string, string> = {
  Referer: 'https://www.dogdrip.net/',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
};

const BASE_URL = 'https://www.dogdrip.net';
const POPULAR_URL = `${BASE_URL}/dogdrip?sort_index=popular`;

export class DogdripScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml(POPULAR_URL, {
      headers: BROWSER_HEADERS,
      delay: [2000, 4000],
    });

    const posts: ScrapedPost[] = [];

    $('li.webzine').each((_, el) => {
      const li = $(el);

      // ── Title + URL ──
      const a = li.find('a.title-link[data-document-srl]').first();
      const title = a.text().trim();
      if (!title || title.length < 3) return;

      const href = a.attr('href') ?? '';
      // href 예: "/dogdrip/695124387?sort_index=popular&page=1"
      // query string 제거하여 canonical URL 생성
      const pathOnly = href.split('?')[0];
      const url = pathOnly.startsWith('http')
        ? pathOnly
        : `${BASE_URL}${pathOnly}`;

      // ── Thumbnail ──
      const thumbSrc = li.find('img.webzine-thumbnail').attr('src');
      const thumbnail = thumbSrc
        ? (thumbSrc.startsWith('http') ? thumbSrc : `${BASE_URL}${thumbSrc}`)
        : undefined;

      // ── Comment count: <span> 바로 뒤 title-link의 형제 span (text-xxsmall) ──
      // 구조: <h5><a class="title-link">제목</a><span class="text-xxsmall">20</span></h5>
      const commentSpan = a.next('span');
      const commentCount = parseInt(commentSpan.text().trim(), 10) || undefined;

      // ── Like count: fa-thumbs-up 아이콘 옆 span ──
      // 구조: <span><i class="far fa-thumbs-up"></i></span><span>119</span>
      const thumbsUpContainer = li.find('.fa-thumbs-up').closest('span');
      const likeSpan = thumbsUpContainer.next('span');
      const likeCount = parseInt(likeSpan.text().trim(), 10) || undefined;

      // ── Date: fa-clock 아이콘이 있는 span의 텍스트 ──
      // 구조: <span class="text-muted text-xxsmall"><i class="far fa-clock"></i> 50 분 전</span>
      const dateContainer = li.find('.fa-clock').parent();
      const dateText = dateContainer.text().trim();
      const publishedAt = parseKoreanDate(dateText);

      // ── Author: member link ──
      const authorEl = li.find('a[class*="member_"]');
      const author = authorEl.text().replace(/^\[.*?\]\s*/, '').trim() || undefined;

      posts.push({
        sourceKey: 'dogdrip',
        sourceName: '개드립',
        title,
        url,
        thumbnail,
        author,
        commentCount,
        likeCount,
        publishedAt,
      });
    });

    return posts.slice(0, 30);
  }
}
