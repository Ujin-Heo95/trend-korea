import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

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

    $('a[href^="/talk/"]').each((_, el) => {
      const href = ($(el).attr('href') ?? '').replace(/#.*$/, '').replace(/\?.*$/, '');
      if (!/^\/talk\/\d+$/.test(href)) return;
      if (seen.has(href)) return;
      seen.add(href);

      const title = ($(el).attr('title') ?? $(el).text()).trim();
      if (!title || title.length < 3) return;

      const url = `https://pann.nate.com${href}`;
      posts.push({
        sourceKey: 'natepann_ranking',
        sourceName: '네이트판 명예의 전당',
        title,
        url,
      });
    });

    if (posts.length === 0) {
      throw new Error('Nate Pann Ranking: no posts found — selector may have changed');
    }

    return posts.slice(0, 30);
  }
}
