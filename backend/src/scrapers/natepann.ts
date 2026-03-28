import Parser from 'rss-parser';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const parser = new Parser({ timeout: 10000 });

export class NatepannScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }
  async fetch(): Promise<ScrapedPost[]> {
    const feed = await parser.parseURL('https://pann.nate.com/rss/Talk');
    return (feed.items ?? []).slice(0, 30).map(item => ({
      sourceKey: 'natepann', sourceName: '네이트판',
      title: item.title?.trim() ?? '',
      url: item.link ?? '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
    })).filter(p => p.url);
  }
}
