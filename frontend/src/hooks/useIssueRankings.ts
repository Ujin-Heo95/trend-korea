import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchIssueRankings, fetchIssueVersion } from '../api/client';
import { consumePrefetch } from '../lib/prefetch';
import type { IssueRankingResponse } from '../types';

const VERSION_POLL_MS = 30_000; // 30초마다 버전 체크

export const useIssueRankings = () => {
  const queryClient = useQueryClient();
  const lastVersionRef = useRef<string | null>(null);

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

  return useQuery<IssueRankingResponse>({
    queryKey: ['issue-rankings'],
    queryFn: async () => {
      const prefetched = await consumePrefetch<IssueRankingResponse>('issueRankings');
      if (prefetched) return prefetched;
      return fetchIssueRankings({ limit: 30 });
    },
    staleTime: 60_000, // 1분 — 탭 전환 시에도 빠른 반영
  });
};
