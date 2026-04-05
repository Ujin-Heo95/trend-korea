import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

export class InvenScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.inven.co.kr/board/it/2652', {
      headers: { Referer: 'https://www.inven.co.kr/' },
    });

    const posts: ScrapedPost[] = [];

    // 인벤 게시판: tr.tr 행 내 제목 링크 (bbsSubject 또는 subject-link)
    $('a.bbsSubject, a.subject-link').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const title = $(el).text().replace(/\[.*?\]/g, '').trim().replace(/\s+/g, ' ');
      if (!title || title.length < 3) return;

      const url = href.startsWith('http') ? href : `https://www.inven.co.kr${href}`;

      const row = $(el).closest('tr');

      // 댓글 수: span.sj_cm 또는 .con-comment
      const commentText = row.find('.sj_cm, .con-comment').text();
      const commentMatch = commentText.match(/\[?(\d+)\]?/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;

      const author = row.find('td.user .layerNickName, td.user span, td.writer').last().text().trim() || undefined;
      const viewCount = parseInt(row.find('td.view, td.read').text().replace(/,/g, '')) || undefined;
      const likeCount = parseInt(row.find('td.reco, td.recommend').text().replace(/,/g, '')) || undefined;

      const dateText = row.find('td.date').text().trim();
      const publishedAt = parseKoreanDate(dateText);
      posts.push({ sourceKey: 'inven', sourceName: '인벤', title, url, author, viewCount, commentCount, likeCount, publishedAt });
    });

    return posts.slice(0, 30);
  }
}
