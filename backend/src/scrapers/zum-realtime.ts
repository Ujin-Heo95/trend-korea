import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { logger } from '../utils/logger.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://news.zum.com/',
};

// ZUM 뉴스 랭킹 (언론사별 가장 많이 본 뉴스)
// https://news.zum.com/ 메인 페이지의 home_ranking_news 섹션
// UTF-8 인코딩

/** 기사 페이지에서 og:image 추출 (실패 시 undefined) */
async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const { data } = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 8_000,
      maxRedirects: 3,
    });
    const $ = cheerio.load(data);
    return $('meta[property="og:image"]').attr('content') || undefined;
  } catch {
    return undefined;
  }
}

export class ZumNewsScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get<string>('https://news.zum.com/', {
      headers: HEADERS,
      timeout: 15_000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];
    const ogTargets: { index: number; url: string }[] = [];

    // 상위 4개: div.news_item_grid 내 썸네일 + 제목
    $('section.home_ranking_news div.news_item_grid li').each((_, el) => {
      if (posts.length >= 30) return;

      const a = $(el).find('a.item');
      const href = a.attr('href') ?? '';
      const title = a.find('h2.title').text().trim();
      if (!title || !href) return;

      const url = href.startsWith('http')
        ? href
        : `https://news.zum.com${href}`;

      const rank = parseInt(a.attr('data-r') ?? '', 10) || posts.length + 1;
      const thumbnail = a.find('img').attr('src') || undefined;
      const author = $(el).find('span.media a').text().trim() || undefined;

      posts.push({
        sourceKey: 'zum_news',
        sourceName: 'ZUM 뉴스 랭킹',
        title,
        url,
        thumbnail,
        author,
        category: 'portal',
        metadata: { rank },
      });
    });

    // 하위 목록: div.bottom_list 내 텍스트 목록 (썸네일 없음 → og:image 추출 대상)
    $('section.home_ranking_news div.bottom_list li').each((_, el) => {
      if (posts.length >= 30) return;

      const a = $(el).find('a.item');
      const href = a.attr('href') ?? '';
      const title = a.find('p.title').text().trim();
      if (!title || !href) return;

      const url = href.startsWith('http')
        ? href
        : `https://news.zum.com${href}`;

      const rank = parseInt(a.attr('data-r') ?? '', 10) || posts.length + 1;
      const author = $(el).find('span.media').text().trim() || undefined;

      const idx = posts.length;
      posts.push({
        sourceKey: 'zum_news',
        sourceName: 'ZUM 뉴스 랭킹',
        title,
        url,
        author,
        category: 'portal',
        metadata: { rank },
      });

      ogTargets.push({ index: idx, url });
    });

    // bottom_list 기사들의 og:image 병렬 추출 (최대 3 동시)
    if (ogTargets.length > 0) {
      const limit = pLimit(3);
      const results = await Promise.allSettled(
        ogTargets.map(({ index, url }) =>
          limit(async () => {
            const ogImg = await fetchOgImage(url);
            if (ogImg) posts[index] = { ...posts[index], thumbnail: ogImg };
          }),
        ),
      );
      const fetched = results.filter(r => r.status === 'fulfilled').length;
      const withThumb = ogTargets.filter(t => posts[t.index].thumbnail).length;
      logger.debug({ fetched, withThumb, total: ogTargets.length }, '[zum] og:image fetch complete');
    }

    return posts;
  }
}
