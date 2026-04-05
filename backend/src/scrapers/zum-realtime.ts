import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class ZumRealtimeScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://zum.com/', {
      headers: UA,
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('li.issue-word-list__keyword-item').each((_, el) => {
      const rankText = $(el).find('.issue-word-list__rank').text().trim();
      const keyword = $(el).find('.issue-word-list__keyword').text().trim();
      const rank = parseInt(rankText, 10);

      if (!keyword || isNaN(rank)) return;

      const query = encodeURIComponent(keyword);
      posts.push({
        sourceKey: 'zum_realtime',
        sourceName: 'ZUM 실시간 검색어',
        title: `${rank}위 ${keyword}`,
        url: `https://search.zum.com/search.zum?method=uni&query=${query}`,
        viewCount: 100 - (rank - 1) * 10,
        publishedAt: new Date(),
        category: 'trend',
        metadata: {
          keyword,
          rank,
        },
      });
    });

    if (posts.length === 0) {
      throw new Error('ZUM realtime: no keywords found — selector may have changed');
    }

    return posts.slice(0, 30);
  }
}
