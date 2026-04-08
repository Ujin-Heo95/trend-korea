import { useQuery } from '@tanstack/react-query';
import { fetchIssueRankings } from '../api/client';
import type { IssueRankingResponse } from '../types';

const REFETCH_INTERVAL = 10 * 60_000; // 10분

export const useIssueRankings = () =>
  useQuery<IssueRankingResponse>({
    queryKey: ['issue-rankings'],
    queryFn: () => fetchIssueRankings({ limit: 30 }),
    refetchInterval: REFETCH_INTERVAL,
    staleTime: 570_000, // 9분 30초
  });
