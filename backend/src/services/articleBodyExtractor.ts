import type * as cheerio from 'cheerio';
import { fetchHtml } from '../scrapers/http-utils.js';

// Domain → ordered selector chain. First non-empty result wins.
// Each entry is a CSS selector; if it ends with " p" we join all <p>
// children, otherwise we use the element's full text.
type DomainRule = {
  readonly host: string;
  readonly selectors: readonly string[];
  readonly removeWithin: readonly string[];
};

const DOMAIN_RULES: readonly DomainRule[] = [
  {
    host: 'yna.co.kr',
    // Joined paragraphs from .story-news.article give the cleanest body
    // (1500+ chars vs 343 from <article> alone). Falls through to generic
    // article element on layout changes.
    selectors: ['.story-news.article p', 'article p', 'article'],
    removeWithin: ['script', 'style', 'iframe', 'figure', 'aside', '.adrs', '.adv', '.btn'],
  },
];

const MAX_BODY_LEN = 4000;
const FETCH_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — issue summarization tick is 10 min

type CacheEntry = { body: string | null; cachedAt: number };
const cache = new Map<string, CacheEntry>();

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function findRule(host: string): DomainRule | undefined {
  return DOMAIN_RULES.find(r => host === r.host || host.endsWith('.' + r.host));
}

function extractWithRule($: cheerio.CheerioAPI, rule: DomainRule): string | null {
  for (const sel of rule.selectors) {
    if (sel.endsWith(' p')) {
      const parentSel = sel.slice(0, -2);
      const parent = $(parentSel).first();
      if (parent.length === 0) continue;
      // Clone-and-clean to avoid mutating shared DOM if a later selector reuses it
      const clone = parent.clone();
      for (const r of rule.removeWithin) clone.find(r).remove();
      const ps = clone.find('p').map((_i, el) => $(el).text().trim()).get();
      const joined = ps.filter(t => t.length >= 10).join(' ').replace(/\s+/g, ' ').trim();
      if (joined.length >= 100) return joined.slice(0, MAX_BODY_LEN);
      continue;
    }

    const el = $(sel).first();
    if (el.length === 0) continue;
    const clone = el.clone();
    for (const r of rule.removeWithin) clone.find(r).remove();
    const text = clone.text().replace(/\s+/g, ' ').trim();
    if (text.length >= 100) return text.slice(0, MAX_BODY_LEN);
  }
  return null;
}

/**
 * Fetch the URL and extract the article body using the domain's selector chain.
 * Returns null when:
 *   - the host has no rule
 *   - the URL is malformed
 *   - the fetch fails or times out (4s cap)
 *   - all selectors yield <100 chars
 *
 * Results are cached for 30 minutes by URL — the same article often appears in
 * multiple issues within one summarization tick.
 */
export async function extractArticleBody(url: string): Promise<string | null> {
  const host = hostnameOf(url);
  if (!host) return null;
  const rule = findRule(host);
  if (!rule) return null;

  const cached = cache.get(url);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.body;

  let body: string | null = null;
  try {
    const $ = await fetchHtml(url, { timeout: FETCH_TIMEOUT_MS, delay: [0, 50] });
    body = extractWithRule($, rule);
  } catch (err) {
    // Swallow — caller falls back to existing snippet. Log at debug level only;
    // network errors on third-party sites are routine and not actionable.
    console.warn(`[articleBodyExtractor] fetch failed ${host}: ${(err as Error).message}`);
    body = null;
  }

  cache.set(url, { body, cachedAt: Date.now() });
  return body;
}

/** Test-only helper to clear the URL cache between cases. */
export function __resetExtractorCacheForTests(): void {
  cache.clear();
}

/** Exported for tests — checks whether a URL would be handled by any rule. */
export function isExtractorSupported(url: string): boolean {
  const host = hostnameOf(url);
  return host !== null && findRule(host) !== undefined;
}
