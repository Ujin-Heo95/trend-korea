import type { Pool } from 'pg';
import { TrendSignalScraper } from './trend-base.js';
import type { TrendKeywordInput } from './types.js';

interface SidebarEntry {
  readonly document: string;
  readonly status: string;
  readonly date: number;
}

export class NamuwikiScraper extends TrendSignalScraper {
  constructor(pool: Pool) { super(pool); }

  protected override getSourceKey(): string { return 'namuwiki'; }

  async fetchTrendKeywords(): Promise<TrendKeywordInput[]> {
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
      .slice(0, 30)
      .map((e, idx) => ({
        keyword: e.document,
        sourceKey: 'namuwiki',
        signalStrength: Math.max(0.1, 1.0 - idx * 0.03),
        rankPosition: idx + 1,
      }));
  }
}
