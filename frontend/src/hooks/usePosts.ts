import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { fetchPosts, fetchTrending, fetchSources, fetchTrendSignals, fetchTopics, fetchIssueDetail } from '../api/client';
import type { PostsResponse } from '../types';

interface PostsFilter {
  source?: string;
  category?: string;
  subcategory?: string;
  q?: string;
  sort?: string;
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

export const useTrendSignals = () =>
  useQuery({
    queryKey: ['trend-signals'],
    queryFn: fetchTrendSignals,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

export const useTopics = () =>
  useQuery({
    queryKey: ['topics'],
    queryFn: fetchTopics,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

export const useIssueDetail = (postId: number) =>
  useQuery({
    queryKey: ['issue-detail', postId],
    queryFn: () => fetchIssueDetail(postId),
    staleTime: 60_000,
    enabled: postId > 0,
  });
