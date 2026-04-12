import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://imnews.imbc.com/',
};

/**
 * MBC News — imnews.imbc.com is JS gateway, replay/{year}/nwdesk/ is server-rendered
 * with ~20 articles per page (뉴스데스크 다시보기).
 */
export class MbcScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const year = new Date().getFullYear();
    const url = `https://imnews.imbc.com/replay/${year}/nwdesk/`;
    const { data } = await axios.get(url, {
      headers: HEADERS,
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const seen = new Set<string>();
    const posts: ScrapedPost[] = [];

    $('a[href*="imnews.imbc.com"][href*="/article/"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const m = href.match(/^(https?:\/\/imnews\.imbc\.com\/[^"\s]*\/article\/\d+_\d+\.html)/);
      if (!m) return;
      const articleUrl = m[1].replace(/^http:/, 'https:');
      if (seen.has(articleUrl)) return;

      const title = $(el).text().replace(/\s+/g, ' ').trim();
      if (!title || title.length < 5) return;

      seen.add(articleUrl);
      posts.push({
        sourceKey: 'mbc',
        sourceName: 'MBC 뉴스',
        title,
        url: articleUrl,
      });
    });

    return posts.slice(0, 30);
  }
}
