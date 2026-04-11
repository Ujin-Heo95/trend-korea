import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchScraperStatus, toggleSource, triggerScraper } from '../api/adminScrapers';

export function useScraperStatus(token: string | null) {
  return useQuery({
    queryKey: ['admin-scraper-status'],
    queryFn: () => fetchScraperStatus(token!),
    enabled: !!token,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}

export function useToggleSource(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceKey, enabled }: { sourceKey: string; enabled: boolean }) =>
      toggleSource(token, sourceKey, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-scraper-status'] });
    },
  });
}

export function useTriggerScraper(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceKey: string) => triggerScraper(token, sourceKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-scraper-status'] });
      queryClient.invalidateQueries({ queryKey: ['admin-health'] });
    },
  });
}
