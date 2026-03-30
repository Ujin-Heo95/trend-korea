import type { Pool } from 'pg';
import { RssScraper } from './rss.js';
import { config } from '../config/index.js';
import type { BaseScraper } from './base.js';
import sourcesData from './sources.json' with { type: 'json' };

export type SourcePriority = 'high' | 'medium' | 'low';

export interface SourceEntry {
  key: string;
  name: string;
  category: string;
  type: 'rss' | 'html' | 'api' | 'apify';
  priority: SourcePriority;
  enabled: boolean;
  feedUrl?: string;
  module?: string;
  className?: string;
}

export interface ResolvedScraper {
  sourceKey: string;
  scraper: BaseScraper;
  priority: SourcePriority;
}

function getAllSources(): readonly SourceEntry[] {
  return sourcesData.sources as SourceEntry[];
}

export function getEnabledSources(): readonly SourceEntry[] {
  return getAllSources().filter(s => s.enabled);
}

export function getSourceMeta(): readonly { key: string; name: string; category: string }[] {
  return getAllSources().map(s => ({ key: s.key, name: s.name, category: s.category }));
}

export function getSourcesByPriority(priority: SourcePriority): readonly SourceEntry[] {
  return getEnabledSources().filter(s => s.priority === priority);
}

export async function buildScrapers(pool: Pool): Promise<readonly ResolvedScraper[]> {
  const enabled = getEnabledSources();
  const scrapers: ResolvedScraper[] = [];

  for (const source of enabled) {
    const scraper = await buildOneScraper(source, pool);
    if (scraper) {
      scraper.category = source.category;
      scrapers.push({ sourceKey: source.key, scraper, priority: source.priority });
    }
  }

  return scrapers;
}

async function buildOneScraper(source: SourceEntry, pool: Pool): Promise<BaseScraper | null> {
  if (source.type === 'rss') {
    if (!source.feedUrl) {
      console.warn(`[registry] ${source.key}: rss type requires feedUrl, skipping`);
      return null;
    }
    return new RssScraper({
      sourceKey: source.key,
      sourceName: source.name,
      feedUrl: source.feedUrl,
      maxItems: 30,
      pool,
    });
  }

  if (!source.module || !source.className) {
    console.warn(`[registry] ${source.key}: html/api/apify type requires module+className, skipping`);
    return null;
  }

  try {
    const mod = await import(source.module);
    const ScraperClass = mod[source.className];
    if (!ScraperClass) {
      console.warn(`[registry] ${source.key}: class ${source.className} not found in ${source.module}`);
      return null;
    }

    // YouTube scrapers need extra apiKey argument
    if (source.key === 'youtube' || source.key === 'youtube_search') {
      return new ScraperClass(pool, config.youtubeApiKey);
    }
    return new ScraperClass(pool);
  } catch (err) {
    console.error(`[registry] ${source.key}: failed to load module ${source.module}:`, err);
    return null;
  }
}
