import axios from 'axios';
import * as cheerio from 'cheerio';

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

interface FetchHtmlOptions {
  /** Extra headers merged on top of defaults */
  headers?: Record<string, string>;
  /** Request timeout in ms (default 15 000) */
  timeout?: number;
  /** Site uses EUC-KR encoding instead of UTF-8 */
  eucKr?: boolean;
}

/**
 * Fetch a URL and return a cheerio-loaded document.
 * Handles EUC-KR decoding when `eucKr: true`.
 */
export async function fetchHtml(
  url: string,
  opts: FetchHtmlOptions = {},
): Promise<cheerio.CheerioAPI> {
  const { headers = {}, timeout = 15_000, eucKr = false } = opts;

  if (eucKr) {
    const { data } = await axios.get<ArrayBuffer>(url, {
      headers: { ...DEFAULT_HEADERS, ...headers },
      timeout,
      responseType: 'arraybuffer',
    });
    const decoded = new TextDecoder('euc-kr').decode(data);
    return cheerio.load(decoded);
  }

  const { data } = await axios.get<string>(url, {
    headers: { ...DEFAULT_HEADERS, ...headers },
    timeout,
  });
  return cheerio.load(data);
}
