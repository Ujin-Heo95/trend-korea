import Parser from 'rss-parser';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const parser = new Parser({ timeout: 10000 });

export class RuliwebScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const feed = await parser.parseURL('https://bbs.ruliweb.com/best/rss');
    return (feed.items ?? []).slice(0, 30).map(item => ({
      sourceKey: 'ruliweb', sourceName: '루리웹',
      title: item.title?.trim() ?? '',
      url: item.link ?? '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
    })).filter(p => p.url);
  }
}
