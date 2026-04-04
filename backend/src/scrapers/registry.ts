import type { Pool } from 'pg';
import { RssScraper } from './rss.js';
import { config } from '../config/index.js';
import type { BaseScraper } from './base.js';
import { logger } from '../utils/logger.js';
import sourcesData from './sources.json' with { type: 'json' };

export type SourcePriority = 'high' | 'medium' | 'low';

export interface SourceEntry {
  key: string;
  name: string;
  category: string;
  subcategory?: string;
  type: 'rss' | 'html' | 'api' | 'apify';
  priority: SourcePriority;
  enabled: boolean;
  feedUrl?: string;
  encoding?: string;
  module?: string;
  className?: string;
  sectionFeeds?: Record<string, string>;
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
  return getAllSources().map(s => ({ key: s.key, name: s.name, category: s.category, subcategory: s.subcategory }));
}

export function getSourcesByPriority(priority: SourcePriority): readonly SourceEntry[] {
  return getEnabledSources().filter(s => s.priority === priority);
}

const API_KEY_REQUIREMENTS: Record<string, { key: keyof typeof config; label: string }> = {
  youtube:        { key: 'youtubeApiKey',    label: 'YOUTUBE_API_KEY' },
  youtube_search: { key: 'youtubeApiKey',    label: 'YOUTUBE_API_KEY' },
  daum_cafe:      { key: 'kakaoRestApiKey',  label: 'KAKAO_REST_API_KEY' },
  daum_blog:      { key: 'kakaoRestApiKey',  label: 'KAKAO_REST_API_KEY' },
  naver_datalab:  { key: 'naverClientId',    label: 'NAVER_CLIENT_ID' },
  kobis_boxoffice:{ key: 'kobisApiKey',      label: 'KOBIS_API_KEY' },
  kopis_boxoffice:{ key: 'kopisApiKey',      label: 'KOPIS_API_KEY' },
  tour_festival:  { key: 'dataGoKrApiKey',   label: 'DATA_GO_KR_API_KEY' },
  tour_visitor:   { key: 'dataGoKrApiKey',   label: 'DATA_GO_KR_API_KEY' },
  kcisa_performance:{ key: 'dataGoKrApiKey',  label: 'DATA_GO_KR_API_KEY' },
  airkorea:         { key: 'dataGoKrApiKey',   label: 'DATA_GO_KR_API_KEY' },
};

let cachedScrapers: readonly ResolvedScraper[] | null = null;

export async function buildScrapers(pool: Pool): Promise<readonly ResolvedScraper[]> {
  if (cachedScrapers) return cachedScrapers;

  const enabled = getEnabledSources();
  const scrapers: ResolvedScraper[] = [];
  const missingKeys: string[] = [];

  for (const source of enabled) {
    const req = API_KEY_REQUIREMENTS[source.key];
    if (req && !config[req.key]) {
      missingKeys.push(`${source.name} (${source.key}): ${req.label} 미설정`);
    }

    // Apify scrapers need APIFY_API_TOKEN
    if (source.type === 'apify' && !config.apifyApiToken) {
      missingKeys.push(`${source.name} (${source.key}): APIFY_API_TOKEN 미설정`);
    }

    const scraper = await buildOneScraper(source, pool);
    if (scraper) {
      scraper.category = source.category;
      scraper.subcategory = source.subcategory;
      scrapers.push({ sourceKey: source.key, scraper, priority: source.priority });
    }
  }

  if (missingKeys.length > 0) {
    logger.warn({ count: missingKeys.length, keys: missingKeys }, '[registry] API 키 누락으로 무음 실패 예상');
  }

  cachedScrapers = Object.freeze(scrapers);
  return cachedScrapers;
}

/** Reset cached scrapers (useful for testing or dynamic reconfiguration) */
export function resetScraperCache(): void {
  cachedScrapers = null;
}

async function buildOneScraper(source: SourceEntry, pool: Pool): Promise<BaseScraper | null> {
  if (source.type === 'rss') {
    if (!source.feedUrl) {
      logger.warn({ sourceKey: source.key }, '[registry] rss type requires feedUrl, skipping');
      return null;
    }
    return new RssScraper({
      sourceKey: source.key,
      sourceName: source.name,
      feedUrl: source.feedUrl,
      maxItems: 30,
      pool,
      encoding: source.encoding,
      sectionFeeds: source.sectionFeeds,
    });
  }

  if (!source.module || !source.className) {
    logger.warn({ sourceKey: source.key }, '[registry] html/api/apify type requires module+className, skipping');
    return null;
  }

  try {
    const mod = await import(source.module);
    const ScraperClass = mod[source.className];
    if (!ScraperClass) {
      logger.warn({ sourceKey: source.key, className: source.className, module: source.module }, '[registry] class not found in module');
      return null;
    }

    // API scrapers that need extra apiKey argument
    if (source.key === 'youtube' || source.key === 'youtube_search') {
      return new ScraperClass(pool, config.youtubeApiKey);
    }
    if (source.key === 'daum_cafe' || source.key === 'daum_blog') {
      return new ScraperClass(pool, config.kakaoRestApiKey);
    }
    return new ScraperClass(pool);
  } catch (err) {
    logger.error({ sourceKey: source.key, module: source.module, err }, '[registry] failed to load module');
    return null;
  }
}
