import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { TrendSignalScraper } from './trend-base.js';
import type { TrendKeywordInput } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class ZumRealtimeScraper extends TrendSignalScraper {
  constructor(pool: Pool) { super(pool); }

  protected override getSourceKey(): string { return 'zum_realtime'; }

  async fetchTrendKeywords(): Promise<TrendKeywordInput[]> {
    const { data } = await axios.get('https://zum.com/', {
      headers: UA,
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const entries: TrendKeywordInput[] = [];

    $('li.issue-word-list__keyword-item').each((_, el) => {
      const rankText = $(el).find('.issue-word-list__rank').text().trim();
      const keyword = $(el).find('.issue-word-list__keyword').text().trim();
      const rank = parseInt(rankText, 10);

      if (!keyword || isNaN(rank)) return;

      entries.push({
        keyword,
        sourceKey: 'zum_realtime',
        signalStrength: Math.max(1.0 - (rank - 1) * 0.03, 0.05),
        rankPosition: rank,
        rankDirection: '=',
        rankChange: 0,
      });
    });

    if (entries.length === 0) {
      throw new Error('ZUM realtime: no keywords found — selector may have changed');
    }

    return entries.slice(0, 30);
  }
}
