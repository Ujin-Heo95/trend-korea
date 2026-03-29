import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { fetchPosts, fetchTrending, fetchSources } from '../api/client';
import type { PostsResponse } from '../types';

interface PostsFilter {
  source?: string;
  category?: string;
  q?: string;
}

export const useInfinitePosts = (filter: PostsFilter) =>
  useInfiniteQuery<PostsResponse>({
    queryKey: ['posts', filter],
    queryFn: ({ pageParam }) =>
      fetchPosts({ ...filter, page: pageParam as number, limit: 30 }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const nextPage = last.page + 1;
      return nextPage <= Math.ceil(last.total / last.limit) ? nextPage : undefined;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

export const useTrending = () =>
  useQuery({
    queryKey: ['trending'],
    queryFn: fetchTrending,
    refetchInterval: 60_000,
  });

export const useSources = () =>
  useQuery({
    queryKey: ['sources'],
    queryFn: fetchSources,
    staleTime: 60_000,
  });
