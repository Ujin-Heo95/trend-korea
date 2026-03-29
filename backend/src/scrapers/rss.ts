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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const parser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': UA,
    Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.1',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  },
});

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

