import { useQuery } from '@tanstack/react-query';
import { fetchIssueRankings } from '../api/client';
import type { IssueRankingResponse } from '../types';

function getRefetchInterval(): number {
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  // Quiet hours (02-06 KST): slower polling
  return kstHour >= 2 && kstHour < 6 ? 5 * 60_000 : 60_000;
}

export const useIssueRankings = () =>
  useQuery<IssueRankingResponse>({
    queryKey: ['issue-rankings'],
    queryFn: () => fetchIssueRankings({ limit: 30 }),
    refetchInterval: getRefetchInterval(),
    staleTime: 30_000,
  });
