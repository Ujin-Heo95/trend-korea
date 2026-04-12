import Parser from 'rss-parser';
import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper, stripHtml } from './base.js';
import type { ScrapedPost } from './types.js';
import { logger } from '../utils/logger.js';
import { classifyNewsSubcategory } from './news-classifier.js';

/** CDATA 내부의 HTML 엔티티를 디코딩 (rss-parser가 처리하지 않는 케이스) */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

interface RssScraperConfig {
  sourceKey: string;
  sourceName: string;
  feedUrl: string;
  maxItems: number;
  pool: Pool;
  encoding?: string;
  sectionFeeds?: Record<string, string>;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 2026-04-12: Sec-Fetch-* / Referer 추가 — Cloudflare 기반 사이트(hankyung 등) 의 403 대응.
// Fly nrt IP 가 datacenter 로 감지돼 브라우저 지문 일치 안 하면 차단. 헤더를 Chrome 실제 브라우저에
// 가깝게 맞춰 JA3/TLS fingerprint 는 어쩔 수 없지만 header-level 검사는 통과하도록 한다.
const defaultParser = new Parser({
  timeout: 20_000,
  headers: {
    'User-Agent': UA,
    Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.1',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  },
});

const youtubeParser = new Parser({
  timeout: 20_000,
  headers: {
    'User-Agent': UA,
    Accept: 'application/atom+xml, application/xml, text/xml, */*;q=0.1',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  },
  customFields: {
    item: [
      ['media:group', 'mediaGroup'],
    ],
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSS parser returns dynamic XML-parsed fields
type RssExt = Record<string, any>;

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;

/**
 * 비표준 RSS pubDate를 new Date()가 정확히 파싱할 수 있는 형태로 정규화.
 * 정규화 파이프라인 — 각 단계는 독립적이고, 해당 패턴이 아니면 skip.
 */
function normalizeDate(raw: string): string {
  let s = raw.trim();

  // 1) 숫자 월 → 영문 약어 (nocutnews: "Sat, 11 04 2026 ..." → "Sat, 11 Apr 2026 ...")
  const numMonth = s.match(/^(\w{3},\s*\d{1,2})\s+(\d{2})\s+(\d{4}\s+.*)$/);
  if (numMonth) {
    const idx = parseInt(numMonth[2], 10);
    if (idx >= 1 && idx <= 12) {
      s = `${numMonth[1]} ${MONTH_NAMES[idx - 1]} ${numMonth[3]}`;
    }
  }

  // 2) TZ 없는 ISO-like 날짜 → KST 부여 (investing_kr/traveltimes: "2026-04-11 05:57:47")
  if (/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}$/.test(s)) {
    s = `${s}+09:00`;
  }

  // 3) 한국어 날짜 (jtbc: "2024.10.29" 또는 "2024년 10월 29일 ...")
  const dotDate = s.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (dotDate) {
    s = `${dotDate[1]}-${dotDate[2]}-${dotDate[3]}T00:00:00+09:00`;
  }
  const korDate = s.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (korDate) {
    const timePart = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    const isPm = s.includes('오후');
    let h = timePart ? parseInt(timePart[1], 10) : 0;
    if (isPm && h < 12) h += 12;
    if (!isPm && s.includes('오전') && h === 12) h = 0;
    const mm = timePart ? timePart[2] : '00';
    const ss = timePart ? timePart[3] : '00';
    s = `${korDate[1]}-${korDate[2].padStart(2, '0')}-${korDate[3].padStart(2, '0')}T${String(h).padStart(2, '0')}:${mm}:${ss}+09:00`;
  }

  return s;
}

function safeDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(normalizeDate(value));
  if (isNaN(d.getTime())) return undefined;
  // 미래일자 방어: 1시간 이상 미래면 파싱 오류로 간주
  if (d.getTime() > Date.now() + 3_600_000) return undefined;
  return d;
}

export class RssScraper extends BaseScraper {
  private cfg: RssScraperConfig;

  constructor(cfg: RssScraperConfig) {
    super(cfg.pool);
    this.cfg = cfg;
  }

  async fetch(): Promise<ScrapedPost[]> {
    const parser = this.cfg.sourceKey.startsWith('youtube_')
      ? youtubeParser
      : defaultParser;

    // 섹션별 RSS 피드가 있는 뉴스 소스: 각 섹션을 병렬 fetch → subcategory 태깅
    if (this.cfg.sectionFeeds && Object.keys(this.cfg.sectionFeeds).length > 0) {
      return this.fetchSectionFeeds(parser);
    }

    const feed = this.cfg.encoding && this.cfg.encoding !== 'utf-8'
      ? await this.fetchWithEncoding(parser, this.cfg.encoding)
      : await parser.parseURL(this.cfg.feedUrl);

    const posts = (feed.items ?? [])
      .slice(0, this.cfg.maxItems)
      .map(item => this.mapItem(item))
      .filter(p => p.url);

    // 뉴스 카테고리인 경우 URL 패턴으로 subcategory 자동 분류
    if (this.category === 'news') {
      for (const post of posts) {
        if (!post.subcategory) {
          post.subcategory = classifyNewsSubcategory(post.url, this.cfg.sourceKey, post.title) ?? undefined;
        }
      }
    }

    return posts;
  }

  /** 섹션별 RSS 피드를 병렬 fetch하여 subcategory 태깅 */
  private async fetchSectionFeeds(parser: Parser): Promise<ScrapedPost[]> {
    const entries = Object.entries(this.cfg.sectionFeeds!);
    const perSection = Math.max(5, Math.floor(this.cfg.maxItems / entries.length));

    const results = await Promise.allSettled(
      entries.map(async ([subcategory, feedUrl]) => {
        try {
          const feed = await parser.parseURL(feedUrl);
          return (feed.items ?? []).slice(0, perSection).map(item => {
            const post = this.mapItem(item);
            post.subcategory = subcategory;
            return post;
          });
        } catch (err) {
          logger.warn({ err, subcategory }, `[rss] ${this.cfg.sourceKey} section failed`);
          return [];
        }
      }),
    );

    const posts = results
      .filter((r): r is PromiseFulfilledResult<ScrapedPost[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .filter(p => p.url);

    // URL 기반 중복 제거 (여러 섹션에 같은 기사가 올 수 있음)
    const seen = new Set<string>();
    return posts.filter(p => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
  }

  /** EUC-KR 등 non-UTF-8 RSS 피드를 수동 디코딩 후 파싱 */
  private async fetchWithEncoding(parser: Parser, encoding: string) {
    const { data } = await axios.get<ArrayBuffer>(this.cfg.feedUrl, {
      responseType: 'arraybuffer',
      timeout: 20_000,
      headers: {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.1',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    const decoded = new TextDecoder(encoding).decode(data);
    const cleanXml = decoded.replace(/encoding="[^"]*"/i, 'encoding="UTF-8"');
    return parser.parseString(cleanXml);
  }

  private mapItem(item: Parser.Item): ScrapedPost {
    if (this.cfg.sourceKey.startsWith('youtube_')) {
      return this.mapYoutubeItem(item);
    }

    const ext = item as RssExt;
    const thumbnail = ext.enclosure?.url
      ?? ext['media:content']?.['$']?.url
      ?? ext['media:thumbnail']?.['$']?.url
      ?? undefined;

    const rawSnippet = item.contentSnippet?.trim()
      || stripHtml(item.content ?? '')
      || '';
    const contentSnippet = rawSnippet.slice(0, 4000).trim() || undefined;

    return {
      sourceKey: this.cfg.sourceKey,
      sourceName: this.cfg.sourceName,
      title: decodeHtmlEntities(item.title?.trim() ?? '(제목 없음)'),
      url: (item.link ?? item.guid ?? '').trim(),
      thumbnail,
      author: item.creator ?? ext['dc:creator'] ?? undefined,
      publishedAt: safeDate(item.pubDate),
      contentSnippet,
    };
  }

  private mapYoutubeItem(item: Parser.Item): ScrapedPost {
    const ext = item as RssExt;
    const mediaGroup = ext.mediaGroup ?? {};
    // YouTube Atom: <media:group><media:thumbnail url="..."/></media:group>
    const thumbnail = mediaGroup['media:thumbnail']?.[0]?.['$']?.url
      ?? mediaGroup['media:thumbnail']?.['$']?.url
      ?? undefined;

    // YouTube Atom: <media:group><media:description>...</media:description></media:group>
    const descRaw = mediaGroup['media:description']?.[0]
      ?? mediaGroup['media:description']
      ?? '';
    const contentSnippet = descRaw.toString().slice(0, 500).trim() || undefined;

    return {
      sourceKey: this.cfg.sourceKey,
      sourceName: this.cfg.sourceName,
      title: decodeHtmlEntities(item.title?.trim() ?? '(제목 없음)'),
      url: (item.link ?? item.guid ?? '').trim(),
      thumbnail,
      contentSnippet,
      author: ext.author ?? item.creator ?? undefined,
      publishedAt: safeDate(item.isoDate ?? item.pubDate),
    };
  }
}

