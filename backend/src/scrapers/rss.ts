import Parser from 'rss-parser';
import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper, stripHtml } from './base.js';
import type { ScrapedPost } from './types.js';
import { logger } from '../utils/logger.js';
import { classifyNewsSubcategory } from './news-classifier.js';

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

const defaultParser = new Parser({
  timeout: 20_000,
  headers: {
    'User-Agent': UA,
    Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.1',
    'Accept-Language': 'ko-KR,ko;q=0.9',
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

function safeDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  // 미래일자 방어: 1시간 이상 미래면 파싱 오류로 간주 (nocutnews 비표준 날짜 등)
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
          post.subcategory = classifyNewsSubcategory(post.url, this.cfg.sourceKey) ?? undefined;
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
    const contentSnippet = rawSnippet.slice(0, 500).trim() || undefined;

    return {
      sourceKey: this.cfg.sourceKey,
      sourceName: this.cfg.sourceName,
      title: item.title?.trim() ?? '(제목 없음)',
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
      title: item.title?.trim() ?? '(제목 없음)',
      url: (item.link ?? item.guid ?? '').trim(),
      thumbnail,
      contentSnippet,
      author: ext.author ?? item.creator ?? undefined,
      publishedAt: safeDate(item.isoDate ?? item.pubDate),
    };
  }
}

