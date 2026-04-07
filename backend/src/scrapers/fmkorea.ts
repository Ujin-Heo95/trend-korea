import type { Pool } from 'pg';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';
import { logger } from '../utils/logger.js';

/**
 * FMKorea (에펨코리아) 스크래퍼
 *
 * FMKorea uses XpressEngine CMS with a WASM-based anti-bot challenge (fm5).
 * Strategy:
 *   1. Primary — Two-step cookie bypass: extract `lite_year` cookie from the
 *      challenge page JS, then request with that cookie + ddosCheckOnly param.
 *      If the WASM gate isn't enforced, this gets through.
 *   2. Fallback — RSS feed via `?act=rss` with the bypass cookie.
 *   3. Fallback — Direct HTML with full anti-bot headers.
 *
 * The challenge page returns HTTP 430 with a JS snippet that:
 *   a) Sets a `lite_year` cookie via `document.cookie`
 *   b) Loads a WASM module from `/mc/mc.php` and calls `fm5(cookie, token)`
 *   c) Redirects with `?ddosCheckOnly=1`
 *
 * Without the WASM step, success depends on server-side rate/IP policy.
 */

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ANTI_BOT_HEADERS: Record<string, string> = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'max-age=0',
  'Connection': 'keep-alive',
  'Sec-Ch-Ua': '"Chromium";v="131", "Google Chrome";v="131", "Not?A_Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

const BASE_URL = 'https://www.fmkorea.com';
const BEST_URL = `${BASE_URL}/index.php?mid=best`;
const RSS_URL = `${BEST_URL}&act=rss`;

function randomDelay(min: number, max: number): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

/** Extract `lite_year` cookie value from the FMKorea challenge page HTML. */
function extractChallengeToken(html: string): string | undefined {
  const match = html.match(/lite_year.*?escape\('([a-f0-9]{32})'\)/);
  return match?.[1];
}

/**
 * Attempt the two-step cookie bypass:
 * 1. Fetch challenge page → extract lite_year cookie
 * 2. Request target URL with that cookie + ddosCheckOnly
 * 3. Request actual target with resulting session
 */
async function fetchWithCookieBypass(
  targetUrl: string,
  timeout: number,
): Promise<{ data: ArrayBuffer; status: number } | null> {
  try {
    // Step 1: get challenge page to extract cookie token
    const challengeRes = await axios.get<ArrayBuffer>(BEST_URL, {
      headers: { 'User-Agent': CHROME_UA, ...ANTI_BOT_HEADERS },
      timeout,
      responseType: 'arraybuffer',
      validateStatus: () => true, // accept any status
    });

    const challengeHtml = new TextDecoder('utf-8').decode(challengeRes.data);
    const token = extractChallengeToken(challengeHtml);
    if (!token) {
      logger.debug('[fmkorea] no challenge token found');
      return null;
    }

    const cookieHeader = `lite_year=${token}; g_lite_year=${token}`;

    await randomDelay(1000, 2000);

    // Step 2: ddosCheckOnly request to register the cookie server-side
    await axios.get(`${BEST_URL}&ddosCheckOnly=1`, {
      headers: {
        'User-Agent': CHROME_UA,
        ...ANTI_BOT_HEADERS,
        'Referer': BEST_URL,
        'Sec-Fetch-Site': 'same-origin',
        'Cookie': cookieHeader,
      },
      timeout,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    await randomDelay(1000, 2000);

    // Step 3: actual target request with cookies
    const finalRes = await axios.get<ArrayBuffer>(targetUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        ...ANTI_BOT_HEADERS,
        'Referer': `${BASE_URL}/`,
        'Sec-Fetch-Site': 'same-origin',
        'Cookie': cookieHeader,
      },
      timeout,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    if (finalRes.status === 200) {
      return { data: finalRes.data, status: 200 };
    }

    logger.debug({ status: finalRes.status }, '[fmkorea] cookie bypass final request failed');
    return null;
  } catch (err) {
    logger.debug({ err }, '[fmkorea] cookie bypass error');
    return null;
  }
}

/** Parse RSS XML into ScrapedPost array. */
function parseRss($: cheerio.CheerioAPI): ScrapedPost[] {
  const posts: ScrapedPost[] = [];

  $('item').each((_, el) => {
    const $el = $(el);
    const rawTitle = $el.find('title').text().trim();
    if (!rawTitle) return;

    const title = rawTitle.replace(/\s*\[\d+\]\s*$/, '').trim();
    const commentMatch = rawTitle.match(/\[(\d+)\]\s*$/);
    const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;

    const link = $el.find('link').text().trim();
    if (!link) return;
    const url = link.startsWith('http') ? link : `${BASE_URL}${link}`;

    // RSS <description> often contains HTML snippet
    const descRaw = $el.find('description').text().trim();
    const contentSnippet = descRaw
      ? descRaw.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim().slice(0, 300) || undefined
      : undefined;

    // RSS <pubDate> or <dc:date>
    const pubDate = $el.find('pubDate').text().trim() || $el.find('dc\\:date').text().trim();
    const publishedAt = pubDate ? new Date(pubDate) : undefined;

    // RSS <author> or <dc:creator>
    const author = $el.find('author').text().trim() || $el.find('dc\\:creator').text().trim() || undefined;

    posts.push({
      sourceKey: 'fmkorea',
      sourceName: '에펨코리아',
      title,
      url,
      author,
      commentCount,
      publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : undefined,
      contentSnippet,
    });
  });

  return posts;
}

/** Parse HTML best page into ScrapedPost array. */
function parseHtml($: cheerio.CheerioAPI): ScrapedPost[] {
  const posts: ScrapedPost[] = [];

  // FMKorea best page uses <li class="li"> list items
  $('li.li').each((_, el) => {
    const $el = $(el);
    const a = $el.find('h3.title a').first();
    const href = a.attr('href') ?? '';
    if (!href) return;

    const rawTitle = a.text().trim();
    const title = rawTitle.replace(/\s*\[\d+\]\s*$/, '').trim();
    if (!title) return;

    const commentMatch = rawTitle.match(/\[(\d+)\]\s*$/);
    const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    const likeCount = parseInt($el.find('.ed .vr').text().replace(/,/g, '')) || undefined;
    const thumbnail = $el.find('.thumbnail img').attr('src') || undefined;

    const viewText = $el.find('.count').text().replace(/,/g, '').trim();
    const viewCount = parseInt(viewText) || undefined;
    const dateText = $el.find('.regdate, .date').text().trim();
    const publishedAt = parseKoreanDate(dateText);

    posts.push({
      sourceKey: 'fmkorea',
      sourceName: '에펨코리아',
      title,
      url,
      thumbnail,
      viewCount,
      commentCount,
      likeCount,
      publishedAt,
    });
  });

  return posts;
}

export class FmkoreaScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const timeout = 20_000;

    // ── Strategy 1: Direct fetchHtml (testable, works when Sec-Fetch headers suffice) ──
    try {
      const $ = await fetchHtml(BEST_URL, {
        headers: {
          ...ANTI_BOT_HEADERS,
          'Referer': `${BASE_URL}/`,
          'Sec-Fetch-Site': 'same-origin',
        },
        delay: [2000, 5000],
        timeout,
      });

      const posts = parseHtml($);
      if (posts.length > 0) {
        logger.info({ count: posts.length }, '[fmkorea] direct HTML fetch succeeded');
        return posts.slice(0, 30);
      }
    } catch {
      // fetchHtml failed — try cookie bypass strategies
    }

    // ── Strategy 2: Two-step cookie bypass → RSS ──
    const rssResult = await fetchWithCookieBypass(RSS_URL, timeout);
    if (rssResult) {
      const html = new TextDecoder('utf-8').decode(rssResult.data);
      if (html.includes('<rss') || html.includes('<channel') || html.includes('<item')) {
        const $ = cheerio.load(html, { xml: true });
        const posts = parseRss($);
        if (posts.length > 0) {
          logger.info({ count: posts.length }, '[fmkorea] RSS via cookie bypass succeeded');
          return posts.slice(0, 30);
        }
      }
    }

    // ── Strategy 3: Two-step cookie bypass → HTML ──
    const htmlResult = await fetchWithCookieBypass(BEST_URL, timeout);
    if (htmlResult) {
      const html = new TextDecoder('utf-8').decode(htmlResult.data);
      if (html.includes('li') && !html.includes('에펨코리아 보안 시스템')) {
        const $ = cheerio.load(html);
        const posts = parseHtml($);
        if (posts.length > 0) {
          logger.info({ count: posts.length }, '[fmkorea] HTML via cookie bypass succeeded');
          return posts.slice(0, 30);
        }
      }
    }

    logger.warn('[fmkorea] all fetch strategies failed (WASM anti-bot active)');
    return [];
  }
}
