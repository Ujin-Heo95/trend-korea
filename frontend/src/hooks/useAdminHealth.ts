import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchHealthAdmin,
  fetchAdminSources,
  isAuthedHealth,
  type HealthResponse,
  type SourceInfo,
  type ScraperRunInfo,
} from '../api/admin';

const TOKEN_KEY = 'weeklit_admin_token';

export function useAdminToken() {
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  );

  const setToken = useCallback((t: string) => {
    localStorage.setItem(TOKEN_KEY, t);
    setTokenState(t);
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setTokenState(null);
  }, []);

  return { token, setToken, clearToken } as const;
}

export interface MergedSource {
  key: string;
  name: string;
  category: string;
  successRate: number | null;
  lastRunAt: string | null;
  lastPostCount: number | null;
  lastError: string | null;
  postCount: number;
  avgPostsPerRun: number | null;
  lastUpdated: string | null;
}

export interface AdminData {
  health: HealthResponse;
  sources: MergedSource[];
}

export function useAdminHealth(token: string | null) {
  const healthQuery = useQuery({
    queryKey: ['admin-health', token],
    queryFn: () => fetchHealthAdmin(token!),
    enabled: !!token,
    refetchInterval: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });

  const sourcesQuery = useQuery({
    queryKey: ['admin-sources'],
    queryFn: fetchAdminSources,
    enabled: !!token,
    refetchInterval: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });

  const isAuthed = healthQuery.data ? isAuthedHealth(healthQuery.data) : null;

  const data = useMemo((): AdminData | null => {
    if (!healthQuery.data || !isAuthedHealth(healthQuery.data) || !sourcesQuery.data) {
      return null;
    }
    const health = healthQuery.data;
    const sourceMap = new Map<string, SourceInfo>();
    for (const s of sourcesQuery.data) {
      sourceMap.set(s.key, s);
    }

    const runMap = new Map<string, ScraperRunInfo>();
    for (const r of health.scrapers.sources) {
      runMap.set(r.source_key, r);
    }

    // 모든 소스 키 합집합
    const allKeys = new Set([...sourceMap.keys(), ...runMap.keys()]);
    const merged: MergedSource[] = [...allKeys].map(key => {
      const src = sourceMap.get(key);
      const run = runMap.get(key);
      return {
        key,
        name: src?.name ?? key,
        category: src?.category ?? '-',
        successRate: src?.success_rate_24h ?? null,
        lastRunAt: run?.last_run_at ?? null,
        lastPostCount: run?.last_post_count ?? null,
        lastError: run?.last_error ?? null,
        postCount: src?.post_count ?? 0,
        avgPostsPerRun: src?.avg_posts_per_run ?? null,
        lastUpdated: src?.last_updated ?? null,
      };
    });

    return { health, sources: merged };
  }, [healthQuery.data, sourcesQuery.data]);

  return {
    data,
    isLoading: healthQuery.isLoading || sourcesQuery.isLoading,
    isError: healthQuery.isError || sourcesQuery.isError,
    error: healthQuery.error ?? sourcesQuery.error,
    isAuthed,
    refetch: () => Promise.all([healthQuery.refetch(), sourcesQuery.refetch()]),
  } as const;
}
