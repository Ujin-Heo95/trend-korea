import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { parseKoreanDate } from './http-utils.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class BobaedreamScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.bobaedream.co.kr/list?code=freeb', {
      headers: UA,
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    // 공지 제외, freeb 링크가 있는 모든 행 선택
    $('tr').each((_, el) => {
      const a = $(el).find('a[href*="code=freeb"]').first();
      const href = a.attr('href') ?? '';
      if (!href || !href.includes('code=freeb')) return;

      const title = (a.attr('title') ?? a.text()).trim();
      if (!title || title.length < 2) return;

      const url = href.startsWith('http') ? href : `https://www.bobaedream.co.kr${href}`;
      const author = $(el).find('.author, td.author, .nick').text().trim() || undefined;

      // 댓글 수: 제목 옆 [N] 또는 .totreply
      const commentEl = $(el).find('.totreply, .cmt_num').first();
      const commentCount = parseInt(commentEl.text().replace(/[[\]()]/g, '')) || undefined;

      // 조회수, 추천수
      const cells = $(el).find('td');
      const viewCount = parseInt($(el).find('td.count, td.hit').text().replace(/[^0-9]/g, '')) || undefined;
      const likeCount = parseInt($(el).find('td.recomm font, td.recomm').first().text().replace(/[^0-9]/g, '')) || undefined;
      const dateText = $(el).find('td.date').text().trim();
      const publishedAt = parseKoreanDate(dateText);

      posts.push({
        sourceKey: 'bobaedream',
        sourceName: '보배드림',
        title,
        url,
        author,
        viewCount,
        commentCount,
        likeCount,
        publishedAt,
      });
    });

    return posts.slice(0, 30);
  }
}
