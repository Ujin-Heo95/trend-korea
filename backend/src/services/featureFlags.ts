import { logger } from '../utils/logger.js';
import { getScoringConfig } from './scoringConfig.js';

/**
 * Feature flags backed by the scoring_config table (group: 'feature_flags').
 * When a flag is disabled, the pipeline step is skipped gracefully.
 * Admin can toggle flags via the existing admin config API.
 */

export interface FeatureFlags {
  readonly embeddings_enabled: boolean;
  readonly gemini_summary_enabled: boolean;
  readonly cross_validation_enabled: boolean;
  readonly apify_scrapers_enabled: boolean;
}

const DEFAULTS: FeatureFlags = {
  embeddings_enabled: true,
  gemini_summary_enabled: true,
  cross_validation_enabled: true,
  apify_scrapers_enabled: true,
};

let cachedFlags: FeatureFlags = { ...DEFAULTS };
let lastLoadedAt = 0;
const CACHE_TTL_MS = 60_000; // 1분

/** Load feature flags from scoring_config, falling back to defaults */
export async function loadFeatureFlags(): Promise<FeatureFlags> {
  const now = Date.now();
  if (now - lastLoadedAt < CACHE_TTL_MS) return cachedFlags;

  try {
    const provider = getScoringConfig();
    const config = await provider.getGroup('feature_flags');
    cachedFlags = {
      embeddings_enabled: config.embeddings_enabled !== false,
      gemini_summary_enabled: config.gemini_summary_enabled !== false,
      cross_validation_enabled: config.cross_validation_enabled !== false,
      apify_scrapers_enabled: config.apify_scrapers_enabled !== false,
    };
    lastLoadedAt = now;
  } catch (err) {
    logger.warn({ err }, '[featureFlags] failed to load — using cached/defaults');
  }

  return cachedFlags;
}

/** Get cached flags synchronously (use after initial loadFeatureFlags call) */
export function getFeatureFlags(): FeatureFlags {
  return cachedFlags;
}
