import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import pLimit from 'p-limit';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };
const DETAIL_LIMIT = pLimit(3);

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
      const cmtEl = $(el).find('.cmt3');
      const cmtTitle = cmtEl.attr('title') ?? '';
      const cmtMatch = cmtTitle.match(/([\d,]+)/);
      const commentCount = cmtMatch ? parseInt(cmtMatch[1].replace(/,/g, '')) || undefined : undefined;

      const dateMatch = listnoText.match(/(\d{2}:\d{2}|\d{2}\.\d{2})/);
      const publishedAt = dateMatch ? parseKoreanDate(dateMatch[1]) : undefined;
      if (title && url) {
        posts.push({ sourceKey: 'instiz', sourceName: '인스티즈', title, url, commentCount, publishedAt });
      }
    });

    const sliced = posts.slice(0, 30);

    // 2단계: 개별 글 페이지에서 조회수/추천수 보강
    const enriched = await Promise.all(
      sliced.map(post => DETAIL_LIMIT(async () => {
        try {
          const detail$ = await fetchHtml(post.url, {
            timeout: 10_000,
            headers: { Referer: 'https://www.instiz.net/pt' },
            delay: [300, 800],
          });
          const bodyText = detail$.text();
          const viewMatch = bodyText.match(/조회\s+([\d,]+)/);
          const likeMatch = bodyText.match(/추천\s+([\d,]+)/);
          return {
            ...post,
            viewCount: viewMatch ? parseInt(viewMatch[1].replace(/,/g, '')) : undefined,
            likeCount: likeMatch ? parseInt(likeMatch[1].replace(/,/g, '')) : undefined,
          };
        } catch {
          return post;
        }
      })),
    );

    return enriched;
  }
}
