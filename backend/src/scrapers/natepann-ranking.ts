import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { parseKoreanDate } from './http-utils.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

/** 네이트판 명예의 전당 — 일간 인기 게시글 랭킹 */
export class NatepannRankingScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://pann.nate.com/talk/ranking/d', {
      headers: UA,
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];
    const seen = new Set<string>();

    // 테이블 행 기반 파싱 시도 (natepann과 유사한 구조)
    $('tbody tr').each((_, el) => {
      const subjectTd = $(el).find('td.subject');
      const a = subjectTd.find('a[href^="/talk/"]').filter((__, link) => {
        const h = $(link).attr('href') ?? '';
        return /^\/talk\/\d+/.test(h);
      }).first();
      const href = (a.attr('href') ?? '').replace(/#.*$/, '').replace(/\?.*$/, '');
      if (!href || seen.has(href)) return;
      seen.add(href);

      const title = (a.attr('title') ?? a.text()).trim();
      if (!title || title.length < 3) return;

      const url = `https://pann.nate.com${href}`;
      const tds = $(el).find('td');
      const viewCount = parseInt(tds.eq(2).text().replace(/,/g, '')) || undefined;
      const likeCount = parseInt(tds.eq(3).text().replace(/,/g, '')) || undefined;
      const commentMatch = subjectTd.find('.reple-num').text().match(/\((\d+)\)/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
      const dateText = tds.eq(4).text().trim() || tds.eq(1).text().trim();
      const publishedAt = parseKoreanDate(dateText);

      posts.push({
        sourceKey: 'natepann_ranking',
        sourceName: '네이트판 명예의 전당',
        title,
        url,
        viewCount,
        commentCount,
        likeCount,
        publishedAt,
      });
    });

    // 폴백: 테이블 구조가 없을 경우 기존 링크 기반 파싱
    if (posts.length === 0) {
      $('a[href^="/talk/"]').each((_, el) => {
        const href = ($(el).attr('href') ?? '').replace(/#.*$/, '').replace(/\?.*$/, '');
        if (!/^\/talk\/\d+$/.test(href)) return;
        if (seen.has(href)) return;
        seen.add(href);

        const title = ($(el).attr('title') ?? $(el).text()).trim();
        if (!title || title.length < 3) return;

        posts.push({
          sourceKey: 'natepann_ranking',
          sourceName: '네이트판 명예의 전당',
          title,
          url: `https://pann.nate.com${href}`,
        });
      });
    }

    if (posts.length === 0) {
      throw new Error('Nate Pann Ranking: no posts found — selector may have changed');
    }

    return posts.slice(0, 30);
  }
}
