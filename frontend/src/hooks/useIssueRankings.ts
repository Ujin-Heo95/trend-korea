import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchIssueRankings, fetchIssueVersion } from '../api/client';
import { consumePrefetch } from '../lib/prefetch';
import type { IssueRankingResponse } from '../types';

const VERSION_POLL_MS = 30_000; // 30초마다 버전 체크

export type TimeWindow = '6h' | '12h' | '24h';

export const useIssueRankings = (window: TimeWindow = '12h') => {
  const queryClient = useQueryClient();
  const lastVersionRef = useRef<string | null>(null);
  const lastStaleAtRef = useRef<number>(0);

  // 경량 버전 폴링 — calculated_at 타임스탬프만 반환 (~50 bytes)
  const { data: versionData } = useQuery({
    queryKey: ['issue-version'],
    queryFn: fetchIssueVersion,
    refetchInterval: VERSION_POLL_MS,
    staleTime: VERSION_POLL_MS - 10_000, // 20초
  });

  // 버전 변경 감지 시 전체 데이터 invalidate
  useEffect(() => {
    const newVersion = versionData?.calculated_at ?? null;
    if (lastVersionRef.current !== null && newVersion !== null && newVersion !== lastVersionRef.current) {
      queryClient.invalidateQueries({ queryKey: ['issue-rankings'] });
    }
    lastVersionRef.current = newVersion;
  }, [versionData?.calculated_at, queryClient]);

  const query = useQuery<IssueRankingResponse>({
    queryKey: ['issue-rankings', window],
    queryFn: async () => {
      // prefetch는 기본 윈도우(12h)에서만 사용
      if (window === '12h') {
        const prefetched = await consumePrefetch<IssueRankingResponse>('issueRankings');
        if (prefetched) return prefetched;
      }
      return fetchIssueRankings({ limit: 30, window });
    },
    // staleTime 0 — version 폴링과 freshness 메타가 invalidation 책임을 전담.
    // React Query 자체 stale 윈도우는 5번 재발한 stale 사고의 일부였으므로 제거.
    staleTime: 0,
  });

  // freshness.is_stale 시 1회 invalidate 시도 (CDN/캐시 우회). 30초 cooldown 으로 폭주 방지.
  // setState 없이 imperative side effect 만 — render-time derived 'showStaleBanner' 가 UI 담당.
  useEffect(() => {
    if (query.data?.freshness?.is_stale !== true) return;
    const now = Date.now();
    if (now - lastStaleAtRef.current < 30_000) return;
    lastStaleAtRef.current = now;
    queryClient.invalidateQueries({ queryKey: ['issue-rankings', window] });
  }, [query.data?.freshness?.is_stale, queryClient, window]);

  // render-time derived: 백엔드가 stale 이라고 응답하면 즉시 배너. state 불필요.
  const showStaleBanner = query.data?.freshness?.is_stale === true;

  return { ...query, showStaleBanner };
};
