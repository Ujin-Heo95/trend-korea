import { useQuery } from '@tanstack/react-query';
import { fetchIssueRankings } from '../api/client';
import { consumePrefetch } from '../lib/prefetch';
import type { IssueRankingResponse } from '../types';

const INTERVAL = 10 * 60_000; // 10분

/** 다음 정각 10분 단위(00,10,20,30,40,50분)까지 남은 ms */
function msUntilNextSlot(): number {
  const now = Date.now();
  const remainder = now % INTERVAL;
  const delay = INTERVAL - remainder;
  // 5초 미만이면 다다음 슬롯으로 (방금 fetch 직후 즉시 재요청 방지)
  return delay < 5_000 ? delay + INTERVAL : delay;
}

export const useIssueRankings = () =>
  useQuery<IssueRankingResponse>({
    queryKey: ['issue-rankings'],
    queryFn: async () => {
      const prefetched = await consumePrefetch<IssueRankingResponse>('issueRankings');
      if (prefetched) return prefetched;
      return fetchIssueRankings({ limit: 30 });
    },
    refetchInterval: msUntilNextSlot,
    staleTime: INTERVAL - 30_000, // 9분 30초
  });
