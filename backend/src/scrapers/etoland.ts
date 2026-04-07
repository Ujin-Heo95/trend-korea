import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

export class EtolandScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml(
      'https://www.etoland.co.kr/bbs/board.php?bo_table=etohumor01',
      {
        eucKr: true,
        delay: [1500, 3000],
        headers: {
          Referer: 'https://www.etoland.co.kr/',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Upgrade-Insecure-Requests': '1',
        },
      },
    );

    const posts: ScrapedPost[] = [];

    $("li.list:not(.notice)").each((_, el) => {
      const a = $(el).find('a.subject_a[href*="etohumor01"][href*="wr_id="]').first();
      if (!a.length) return;

      const href = a.attr('href') ?? '';
      const title = a.text().trim();
      if (!title || title.length < 3 || title.startsWith('※')) return;

      const url = href.startsWith('http')
        ? href
        : `https://www.etoland.co.kr/bbs/${href.replace(/^\.\.\/bbs\//, '')}`;

      const author = $(el).find("div.writer span.member").text().trim() || undefined;
      const viewCount = parseInt($(el).find("div.views").text().replace(/,/g, '').trim()) || undefined;
      const likeCount = parseInt($(el).find("div.sympathys").text().trim()) || undefined;
      const commentMatch = $(el).find("a.comment_count").text().match(/\((\d+)\)/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;

      const dateText = $(el).find("div.datetime, div.date").text().trim();
      const publishedAt = parseKoreanDate(dateText);
      posts.push({ sourceKey: 'etoland', sourceName: '에토랜드', title, url, author, viewCount, commentCount, likeCount, publishedAt });
    });

    return posts.slice(0, 30);
  }
}
