import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise(r => setTimeout(r, ms));
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'User-Agent': randomUserAgent(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    ...extra,
  };
}

interface FetchHtmlOptions {
  /** Extra headers merged on top of defaults */
  headers?: Record<string, string>;
  /** Request timeout in ms (default 15 000) */
  timeout?: number;
  /** Site uses EUC-KR encoding instead of UTF-8 */
  eucKr?: boolean;
  /** Random delay range in ms before request [min, max] (default [500, 2000]) */
  delay?: [number, number];
}

/**
 * Fetch a URL and return a cheerio-loaded document.
 * Applies random User-Agent rotation and pre-request delay to reduce bot detection.
 * Handles EUC-KR decoding when `eucKr: true`.
 */
export async function fetchHtml(
  url: string,
  opts: FetchHtmlOptions = {},
): Promise<cheerio.CheerioAPI> {
  const { headers = {}, timeout = 15_000, eucKr = false, delay = [500, 2000] } = opts;

  await randomDelay(delay[0], delay[1]);

  const { data } = await axios.get<ArrayBuffer>(url, {
    headers: buildHeaders(headers),
    timeout,
    responseType: 'arraybuffer',
  });
  const encoding = eucKr ? 'euc-kr' : 'utf-8';
  const decoded = new TextDecoder(encoding).decode(data);
  return cheerio.load(decoded);
}

/**
 * 한국어 커뮤니티 게시판의 다양한 날짜 형식을 파싱합니다.
 *
 * 지원 형식:
 * - 절대: "2026-04-05 14:30:00", "2026.04.05 14:30", "04.05", "04-05", "04/05"
 * - 상대: "3시간 전", "2분 전", "1일 전", "방금 전", "3시간전"
 * - 영문 상대: "3h", "2m", "1d", "3 hours ago"
 * - 시간만: "14:30" → 오늘 날짜 + 해당 시간
 */
export function parseKoreanDate(text: string, now?: Date): Date | undefined {
  if (!text) return undefined;
  const s = text.trim();
  const ref = now ?? new Date();

  // "방금 전", "방금"
  if (/^방금/.test(s)) return ref;

  // 한국어 상대시간: "N분 전", "N시간 전", "N일 전", "N초 전"
  const koRel = s.match(/(\d+)\s*(초|분|시간|일)\s*전?/);
  if (koRel) {
    const n = parseInt(koRel[1]);
    const unit = koRel[2];
    const d = new Date(ref);
    if (unit === '초') d.setSeconds(d.getSeconds() - n);
    else if (unit === '분') d.setMinutes(d.getMinutes() - n);
    else if (unit === '시���') d.setHours(d.getHours() - n);
    else if (unit === '일') d.setDate(d.getDate() - n);
    return d;
  }

  // 영문 상대시간: "3h", "2m", "1d", "30s", "3 hours ago"
  const enRel = s.match(/(\d+)\s*(s|m|h|d|seconds?|minutes?|hours?|days?)\s*(ago)?/i);
  if (enRel) {
    const n = parseInt(enRel[1]);
    const u = enRel[2].toLowerCase();
    const d = new Date(ref);
    if (u.startsWith('s')) d.setSeconds(d.getSeconds() - n);
    else if (u.startsWith('m')) d.setMinutes(d.getMinutes() - n);
    else if (u.startsWith('h')) d.setHours(d.getHours() - n);
    else if (u.startsWith('d')) d.setDate(d.getDate() - n);
    return d;
  }

  // 절대 날짜: "2026-04-05 14:30:00", "2026.04.05 14:30", "2026/04/05"
  const fullDate = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (fullDate) {
    const [, y, m, d, hh, mm, ss] = fullDate;
    return new Date(+y, +m - 1, +d, +(hh ?? 0), +(mm ?? 0), +(ss ?? 0));
  }

  // 월-일만: "04.05", "04-05", "04/05"
  const shortDate = s.match(/^(\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (shortDate) {
    const [, m, d, hh, mm] = shortDate;
    return new Date(ref.getFullYear(), +m - 1, +d, +(hh ?? 0), +(mm ?? 0));
  }

  // 시간만: "14:30", "09:05"
  const timeOnly = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeOnly) {
    const [, hh, mm, ss] = timeOnly;
    const d = new Date(ref);
    d.setHours(+hh, +mm, +(ss ?? 0), 0);
    return d;
  }

  return undefined;
}
