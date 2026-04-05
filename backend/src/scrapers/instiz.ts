import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { parseKoreanDate } from './http-utils.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

export class InstizScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.instiz.net/pt', { headers: UA, timeout: 15000 });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('a[href^="https://www.instiz.net/pt/"]').each((_, el) => {
      const sbj = $(el).find('.sbj');
      if (!sbj.length) return;

      const url = $(el).attr('href') ?? '';
      const title = sbj.text().trim();
      const listnoText = $(el).find('.listno').text();
      const viewMatch = listnoText.match(/조회\s+([\d,]+)/);
      const viewCount = viewMatch ? parseInt(viewMatch[1].replace(/,/g, '')) : undefined;
      const likeMatch = listnoText.match(/추천\s+([\d,]+)/);
      const likeCount = likeMatch ? parseInt(likeMatch[1].replace(/,/g, '')) : undefined;
      const cmtEl = $(el).find('.cmt3');
      const cmtTitle = cmtEl.attr('title') ?? '';
      const cmtMatch = cmtTitle.match(/([\d,]+)/);
      const commentCount = cmtMatch ? parseInt(cmtMatch[1].replace(/,/g, '')) || undefined : undefined;

      const dateMatch = listnoText.match(/(\d{2}:\d{2}|\d{2}\.\d{2})/);
      const publishedAt = dateMatch ? parseKoreanDate(dateMatch[1]) : undefined;
      if (title && url) {
        posts.push({ sourceKey: 'instiz', sourceName: '인스티즈', title, url, viewCount, commentCount, likeCount, publishedAt });
      }
    });

    return posts.slice(0, 30);
  }
}
