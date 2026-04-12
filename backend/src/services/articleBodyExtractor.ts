import type * as cheerio from 'cheerio';
import { fetchHtml } from '../scrapers/http-utils.js';

// Domain → ordered selector chain. First non-empty result wins.
// Each entry is a CSS selector; if it ends with " p" we join all <p>
// children, otherwise we use the element's full text.
type DomainRule = {
  readonly host: string;
  readonly selectors: readonly string[];
  readonly removeWithin: readonly string[];
  readonly eucKr?: boolean;
  /** Optionally rewrite the URL before fetching (e.g., desktop → mobile for SPA sites). */
  readonly rewriteUrl?: (url: string) => string;
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
  {
    // Daum 뉴스 상세 — v.daum.net/v/{id}. `.article_view` 컨테이너 안의 <p>
    // 태그들이 본문. 광고/기자정보는 figcaption / .txt_caption 등으로 분리됨.
    // 검증: 20260412213003163 → 8 paragraphs, 1279 chars.
    host: 'daum.net',
    selectors: ['.article_view p', '.article_view'],
    removeWithin: ['script', 'style', 'iframe', 'figure', 'figcaption', '.link_figure', '.txt_caption'],
  },
  {
    // Nate 뉴스 상세 — news.nate.com/view/{id}. `#realArtcContents` 단일 div 안에
    // <br> 로 단락 구분된 본문 텍스트가 들어있음 (거의 <p> 없음). element text 경로로 추출.
    // EUC-KR 인코딩. 검증: 20260412n15179 → ~4000 chars.
    host: 'nate.com',
    selectors: ['#realArtcContents'],
    removeWithin: ['script', 'style', 'iframe', '.articleSubecjt', '.articleControl'],
    eucKr: true,
  },
  {
    // 중앙일보 — www.joongang.co.kr/article/{id}. `#article_body` 안 <p> 단락.
    // 검증: /article/25419504 → 6 paragraphs, 596 chars.
    host: 'joongang.co.kr',
    selectors: ['#article_body p', '#article_body', '.article_body p'],
    removeWithin: ['script', 'style', 'iframe', 'figure', 'figcaption', '.ab_photo', '.image'],
  },
  {
    // KBS 뉴스 — news.kbs.co.kr/news/pc/view/view.do?ncd={id}. `.detail-body` 단일
    // element text (본문이 <p> 없이 텍스트 + <br> 로 구성). 검증: ncd=8533684 → 554 chars.
    host: 'kbs.co.kr',
    selectors: ['.detail-body', '#cont_newstext'],
    removeWithin: ['script', 'style', 'iframe', 'figure', 'figcaption', '.reporter', '.related'],
  },
  {
    // YTN — www.ytn.co.kr/_ln/{id}. `#CmAdContent` element text 추출.
    // 검증: /_ln/0103_202604122247188024 → 578 chars.
    host: 'ytn.co.kr',
    selectors: ['#CmAdContent', '.article_txt'],
    removeWithin: ['script', 'style', 'iframe', 'figure', 'figcaption', '.reporter_area', '.link_news'],
  },
  {
    // MBC 뉴스 — imnews.imbc.com/replay/{yr}/nwdesk/article/{id}.html. `.news_txt` element text.
    // 앵커/기자 마커(◀ 앵커 ▶ / ◀ 리포트 ▶) 는 의도적으로 유지 (Gemini 가 구조 힌트로 활용).
    // 검증: 6814612_37004.html → 1192 chars.
    host: 'imbc.com',
    selectors: ['.news_txt', '.content_body'],
    removeWithin: ['script', 'style', 'iframe', 'figure', 'figcaption', '.img_set', '.ad'],
  },
  {
    // ZUM 뉴스 — news.zum.com/articles/{id}. 데스크톱은 SPA 렌더링이라 초기 HTML 에
    // 본문이 없음. 모바일 호스트 m.news.zum.com 은 동일 경로를 SSR 로 제공하며
    // 원 언론사(뉴시스/경향 등)의 본문을 임베드한 HTML5 <article> 태그에 담아서 내려줌.
    // 검증: /articles/105004207 → 1161 chars, /articles/105003213 → 1796 chars.
    host: 'zum.com',
    selectors: ['article'],
    removeWithin: [
      'script', 'style', 'iframe', 'figure', 'figcaption',
      '.link_news', '.linkNews', '.relatedNews', '.ad', 'ins',
    ],
    rewriteUrl: (url) => url.replace(/^https?:\/\/(?:www\.)?news\.zum\.com\//, 'https://m.news.zum.com/'),
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

  const fetchUrl = rule.rewriteUrl ? rule.rewriteUrl(url) : url;
  let body: string | null;
  try {
    const $ = await fetchHtml(fetchUrl, {
      timeout: FETCH_TIMEOUT_MS,
      delay: [0, 50],
      eucKr: rule.eucKr ?? false,
    });
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
