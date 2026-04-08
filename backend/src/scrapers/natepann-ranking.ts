import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

/** 네이트판 명예의 전당 — 일간 인기 게시글 랭킹 (LI+span 구조) */
export class NatepannRankingScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://pann.nate.com/talk/ranking', {
      headers: UA,
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];
    const seen = new Set<string>();

    // 랭킹 페이지: LI 기반 구조 — span.count(조회), span.rcm(추천), .reple-num(댓글)
    $('li').each((_, el) => {
      const a = $(el).find('a[href^="/talk/"]').filter((__, link) => {
        const h = $(link).attr('href') ?? '';
        return /^\/talk\/\d+/.test(h);
      }).first();
      const href = (a.attr('href') ?? '').replace(/#.*$/, '').replace(/\?.*$/, '');
      if (!href || seen.has(href)) return;
      seen.add(href);

      const title = (a.attr('title') ?? a.text()).trim();
      if (!title || title.length < 3) return;

      const url = `https://pann.nate.com${href}`;

      const countText = $(el).find('span.count').text();
      const viewMatch = countText.match(/([\d,]+)/);
      const viewCount = viewMatch ? parseInt(viewMatch[1].replace(/,/g, '')) : undefined;

      const rcmText = $(el).find('span.rcm').text();
      const rcmMatch = rcmText.match(/([\d,]+)/);
      const likeCount = rcmMatch ? parseInt(rcmMatch[1].replace(/,/g, '')) : undefined;

      const repleText = $(el).find('.reple-num').text();
      const repleMatch = repleText.match(/(\d+)/);
      const commentCount = repleMatch ? parseInt(repleMatch[1]) : undefined;

      posts.push({
        sourceKey: 'natepann_ranking',
        sourceName: '네이트판 명예의 전당',
        title,
        url,
        viewCount,
        commentCount,
        likeCount,
      });
    });

    if (posts.length === 0) {
      throw new Error('Nate Pann Ranking: no posts found — selector may have changed');
    }

    return posts.slice(0, 30);
  }
}
