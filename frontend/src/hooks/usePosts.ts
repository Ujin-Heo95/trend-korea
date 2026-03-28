import { useQuery } from '@tanstack/react-query';
import { fetchPosts, fetchTrending, fetchSources } from '../api/client';

export const usePosts = (source?: string, page = 1) =>
  useQuery({
    queryKey: ['posts', source, page],
    queryFn: () => fetchPosts({ source, page, limit: 30 }),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

export const useTrending = () =>
  useQuery({
    queryKey: ['trending'],
    queryFn: fetchTrending,
    refetchInterval: 30_000,
  });

export const useSources = () =>
  useQuery({
    queryKey: ['sources'],
    queryFn: fetchSources,
    staleTime: 60_000,
  });
