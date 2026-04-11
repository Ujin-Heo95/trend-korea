import axios from 'axios';
import type { CircuitBreakerInfo } from './admin.js';

export interface ScraperRunRecord {
  source_key: string;
  started_at: string;
  finished_at: string | null;
  posts_saved: number | null;
  error_message: string | null;
}

export interface ScraperSourceStatus {
  key: string;
  name: string;
  category: string;
  priority: string;
  json_enabled: boolean;
  override_enabled: boolean | null;
  effective_enabled: boolean;
  circuit_breaker: CircuitBreakerInfo | null;
  recent_runs: ScraperRunRecord[];
}

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

export const fetchScraperStatus = (token: string): Promise<ScraperSourceStatus[]> =>
  axios.get('/api/admin/scrapers/status', { headers: authHeader(token) }).then(r => r.data);

export const toggleSource = (token: string, sourceKey: string, enabled: boolean): Promise<void> =>
  axios.post(`/api/admin/scrapers/${sourceKey}/toggle`, { enabled }, { headers: authHeader(token) });

export const triggerScraper = (token: string, sourceKey: string): Promise<{ count: number; error: string | null }> =>
  axios.post(`/api/admin/scrapers/${sourceKey}/run`, {}, { headers: authHeader(token) }).then(r => r.data);
