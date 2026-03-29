import Parser from 'rss-parser';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

interface RssScraperConfig {
  sourceKey: string;
  sourceName: string;
  feedUrl: string;
  maxItems: number;
  pool: Pool;
}

const parser = new Parser({ timeout: 10000 });

export class RssScraper extends BaseScraper {
  private cfg: RssScraperConfig;

  constructor(cfg: RssScraperConfig) {
    super(cfg.pool);
    this.cfg = cfg;
  }

  async fetch(): Promise<ScrapedPost[]> {
    const feed = await parser.parseURL(this.cfg.feedUrl);

    return (feed.items ?? [])
      .slice(0, this.cfg.maxItems)
      .map(item => ({
        sourceKey: this.cfg.sourceKey,
        sourceName: this.cfg.sourceName,
        title: item.title?.trim() ?? '(제목 없음)',
        url: item.link ?? item.guid ?? '',
        author: item.creator ?? (item as any)['dc:creator'] ?? undefined,
        publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
      }))
      .filter(p => p.url);
  }
}

export const RSS_SOURCES: Omit<RssScraperConfig, 'pool'>[] = [
  {
    sourceKey: 'ppomppu',
    sourceName: '뽐뿌',
    feedUrl: 'https://www.ppomppu.co.kr/rss.php?id=ppomppu',
    maxItems: 30,
  },
  {
    sourceKey: 'yna',
    sourceName: '연합뉴스',
    feedUrl: 'https://www.yna.co.kr/rss/news.xml',
    maxItems: 30,
  },
  {
    sourceKey: 'hani',
    sourceName: '한겨레',
    feedUrl: 'https://www.hani.co.kr/rss/',
    maxItems: 30,
  },
  {
    sourceKey: 'sbs',
    sourceName: 'SBS 뉴스',
    feedUrl: 'https://news.sbs.co.kr/news/headlineRssFeed.do?plink=RSSREADER',
    maxItems: 30,
  },
  {
    sourceKey: 'donga',
    sourceName: '동아일보',
    feedUrl: 'https://rss.donga.com/total.xml',
    maxItems: 30,
  },
];
