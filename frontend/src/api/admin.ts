import axios from 'axios';

export interface ScraperRunInfo {
  source_key: string;
  last_run_at: string | null;
  last_post_count: number | null;
  last_error: string | null;
}

export interface ApiKeyInfo {
  key: string;
  configured: boolean;
  valid: boolean | null;
  lastChecked?: string;
  error?: string;
}

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
}

export interface CircuitBreakerInfo {
  failures: number;
  is_open: boolean;
  cooldown_remaining_ms: number;
}

export interface FeatureFlagsInfo {
  embeddings_enabled: boolean;
  gemini_summary_enabled: boolean;
  cross_validation_enabled: boolean;
  apify_scrapers_enabled: boolean;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: {
    connected: boolean;
    post_count: number;
    db_size_mb: number;
    oldest_post_age_days: number;
  };
  scrapers: {
    total: number;
    last_run_at: string | null;
    failed_last_run: number;
    sources: ScraperRunInfo[];
  };
  api_keys: ApiKeyInfo[];
  api_quota?: Record<string, { used: number; resetAt: string }>;
  pool?: { api: PoolStats; batch: PoolStats };
  memory?: { rss_mb: number; heap_used_mb: number; heap_total_mb: number };
  uptime_seconds?: number;
  embedding_cache_size?: number;
  feature_flags?: FeatureFlagsInfo;
  circuit_breakers?: Record<string, CircuitBreakerInfo>;
}

export interface SourceInfo {
  key: string;
  name: string;
  category: string;
  post_count: number;
  last_updated: string | null;
  success_rate_24h: number | null;
  avg_posts_per_run: number | null;
}

/** /health 인증 응답에 scrapers 필드가 있으면 인증 성공 */
export function isAuthedHealth(data: unknown): data is HealthResponse {
  return typeof data === 'object' && data !== null && 'scrapers' in data;
}

export const fetchHealthAdmin = (token: string): Promise<unknown> =>
  axios.get('/api/health', {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.data);

export const fetchAdminSources = (): Promise<SourceInfo[]> =>
  axios.get('/api/sources').then(r => r.data);
