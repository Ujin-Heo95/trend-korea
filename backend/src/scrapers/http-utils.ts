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

  if (eucKr) {
    const { data } = await axios.get<ArrayBuffer>(url, {
      headers: buildHeaders(headers),
      timeout,
      responseType: 'arraybuffer',
    });
    const decoded = new TextDecoder('euc-kr').decode(data);
    return cheerio.load(decoded);
  }

  const { data } = await axios.get<string>(url, {
    headers: buildHeaders(headers),
    timeout,
  });
  return cheerio.load(data);
}
