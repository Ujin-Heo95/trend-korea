import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchIssueRankings, fetchIssueVersion } from '../api/client';
import { consumePrefetch } from '../lib/prefetch';
import type { IssueRankingResponse } from '../types';

const VERSION_POLL_MS = 30_000; // 30초마다 버전 체크
// 백엔드가 freshness.is_stale=true 를 N회 연속 반환하면 사용자에게 배너 노출.
// 1회는 일시적 race condition 일 수 있으므로 2회로.
const STALE_BANNER_THRESHOLD = 2;

export type TimeWindow = '6h' | '12h' | '24h';

export const useIssueRankings = (window: TimeWindow = '12h') => {
  const queryClient = useQueryClient();
  const lastVersionRef = useRef<string | null>(null);
  const staleHitsRef = useRef(0);
  const [showStaleBanner, setShowStaleBanner] = useState(false);

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

  // 백엔드 freshness 메타 기반 자동 stale 처리
  useEffect(() => {
    const f = query.data?.freshness;
    if (!f) return;
    if (f.is_stale) {
      staleHitsRef.current += 1;
      // 첫 stale 감지 시 1회 강제 refetch 시도 — 캐시/CDN 우회
      if (staleHitsRef.current === 1) {
        queryClient.invalidateQueries({ queryKey: ['issue-rankings', window] });
      }
      if (staleHitsRef.current >= STALE_BANNER_THRESHOLD) {
        setShowStaleBanner(true);
      }
    } else {
      staleHitsRef.current = 0;
      if (showStaleBanner) setShowStaleBanner(false);
    }
  }, [query.data?.freshness, queryClient, window, showStaleBanner]);

  return { ...query, showStaleBanner };
};
