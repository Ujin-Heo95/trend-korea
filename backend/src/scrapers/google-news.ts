import Parser from 'rss-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import type { Pool } from 'pg';
import { BaseScraper, stripHtml } from './base.js';
import type { ScrapedPost } from './types.js';
import { logger } from '../utils/logger.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';
const FEED_URL = 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko';
const OG_FETCH_LIMIT = 10; // 상위 N건만 og:image 추출 (비용 절감)

const parser = new Parser({
  timeout: 20_000,
  headers: {
    'User-Agent': UA,
    Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.1',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  },
});

/** Google News 기사 redirect 페이지에서 og:image 추출 */
async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const { data } = await axios.get<string>(url, {
      headers: { 'User-Agent': UA },
      timeout: 8_000,
      maxRedirects: 5,
    });
    const $ = cheerio.load(data);
    return $('meta[property="og:image"]').attr('content') || undefined;
  } catch {
    return undefined;
  }
}

// Google News RSS: enclosure/media:content 없음, content에 <ol><li><a> 링크만 포함
// → 상위 기사에 og:image 보강 필요

export class GoogleNewsScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const feed = await parser.parseURL(FEED_URL);

    const posts: ScrapedPost[] = (feed.items ?? [])
      .slice(0, 30)
      .map(item => {
        const rawSnippet = item.contentSnippet?.trim()
          || stripHtml(item.content ?? '')
          || '';

        return {
          sourceKey: 'google_news_kr',
          sourceName: 'Google 뉴스 한국',
          title: item.title?.trim() ?? '(제목 없음)',
          url: (item.link ?? item.guid ?? '').trim(),
          author: (item as Record<string, unknown>).creator as string | undefined
            ?? (item as Record<string, unknown>)['dc:creator'] as string | undefined
            ?? undefined,
          publishedAt: item.pubDate ? safeDate(item.pubDate) : undefined,
          contentSnippet: rawSnippet.slice(0, 500).trim() || undefined,
          category: 'portal',
        };
      })
      .filter(p => p.url);

    // 상위 N건 og:image 병렬 추출 (최대 4 동시)
    const limit = pLimit(4);
    const targets = posts.slice(0, OG_FETCH_LIMIT);
    const results = await Promise.allSettled(
      targets.map((post, idx) =>
        limit(async () => {
          const ogImg = await fetchOgImage(post.url);
          if (ogImg) posts[idx] = { ...posts[idx], thumbnail: ogImg };
        }),
      ),
    );

    const withThumb = targets.filter((_, i) => posts[i].thumbnail).length;
    logger.debug({ fetched: results.length, withThumb, total: posts.length }, '[google_news] og:image fetch complete');

    return posts;
  }
}

function safeDate(value: string): Date | undefined {
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  if (d.getTime() > Date.now() + 3_600_000) return undefined;
  return d;
}
