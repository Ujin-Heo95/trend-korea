import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

interface SidebarEntry {
  readonly document: string;
  readonly status: string;
  readonly date: number;
}

export class NamuwikiScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const res = await fetch('https://namu.wiki/sidebar.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Namuwiki sidebar API HTTP ${res.status}`);

    const entries: readonly SidebarEntry[] = await res.json() as SidebarEntry[];

    return entries
      .filter(e => e.status === 'normal' && e.document.length >= 2)
      .map(e => ({
        sourceKey: 'namuwiki',
        sourceName: '나무위키',
        title: `${e.document} (최근 편집)`,
        url: `https://namu.wiki/w/${encodeURIComponent(e.document)}`,
        publishedAt: new Date(e.date * 1000),
      }))
      .slice(0, 30);
  }
}
