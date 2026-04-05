import { useQuery } from '@tanstack/react-query';
import { fetchIssueRankings } from '../api/client';
import type { IssueRankingResponse } from '../types';

export const useIssueRankings = () =>
  useQuery<IssueRankingResponse>({
    queryKey: ['issue-rankings'],
    queryFn: () => fetchIssueRankings({ limit: 30 }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
