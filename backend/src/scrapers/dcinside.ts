import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { parseKoreanDate } from './http-utils.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.dcinside.com/',
};

export class DcinsideScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://gall.dcinside.com/board/lists/?id=dcbest', {
      headers: HEADERS,
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('tr.ub-content.us-post').each((_, el) => {
      const a = $(el).find('td.gall_tit a[href*="/board/view/"]').first();
      const href = a.attr('href') ?? '';
      if (!href) return;

      const title = a.text().replace(/\[.*?\]/g, '').trim();
      const url = href.startsWith('http') ? href : `https://gall.dcinside.com${href}`;
      const viewCount = parseInt($(el).find('td.gall_count').text().replace(/,/g, '')) || undefined;
      const commentMatch = $(el).find('.reply_num').text().match(/\[(\d+)\]/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
      const likeCount = parseInt($(el).find('td.gall_recommend').text().replace(/,/g, '')) || undefined;
      const writerEl = $(el).find('td.gall_writer');
      const author = writerEl.attr('data-nick') || writerEl.find('em').text().trim() || undefined;
      const dateText = $(el).find('td.gall_date').attr('title') ?? $(el).find('td.gall_date').text().trim();
      const publishedAt = parseKoreanDate(dateText);

      if (title) {
        posts.push({
          sourceKey: 'dcinside',
          sourceName: 'DC인사이드',
          title,
          url,
          author,
          viewCount,
          commentCount,
          likeCount,
          publishedAt,
        });
      }
    });

    return posts.slice(0, 30);
  }
}
