import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useInfinitePosts } from '../hooks/usePosts';
import { fetchPosts } from '../api/client';
import { PostCard } from '../components/PostCard';
import { TrendingSection } from '../components/TrendingSection';
import { TrendRadar } from '../components/TrendRadar';
import { CategoryTabs } from '../components/CategoryTabs';
import { SourceFilterChips } from '../components/SourceFilterChips';
import { MovieRankingTable } from '../components/MovieRankingTable';
import { PerformanceRankingTable } from '../components/PerformanceRankingTable';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const CATEGORY_TITLES: Record<string, string> = {
  community: '커뮤니티',
  'news,press,newsletter': '뉴스',
  'tech,techblog': '테크',
  video: 'YouTube',
  'deals,sports,trend,government,finance,alert': '생활',
  movie: '박스오피스',
  performance: '공연/전시',
};

interface Props {
  category: string | undefined;
  onCategoryChange: (cat: string | undefined) => void;
  searchQuery: string;
}

export const HomePage: React.FC<Props> = ({ category, onCategoryChange, searchQuery }) => {
  useDocumentTitle(category ? CATEGORY_TITLES[category] : undefined);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<'trending' | 'latest'>('trending');

  const handleCategoryChange = (cat: string | undefined) => {
    onCategoryChange(cat);
    setSelectedSources([]);
    setSortMode('trending');
  };

  const filter = {
    ...(category ? { category } : {}),
    ...(searchQuery ? { q: searchQuery } : {}),
    ...(selectedSources.length > 0 ? { source: selectedSources.join(',') } : {}),
    ...(category === 'community' ? { sort: sortMode } : {}),
  };

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isFetching,
  } = useInfinitePosts(filter);

  // 영상 탭: 인기 급상승 영상 별도 조회
  const { data: popularVideos } = useQuery({
    queryKey: ['video_popular'],
    queryFn: () => fetchPosts({ category: 'video_popular', limit: 10 }),
    enabled: category === 'video',
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  const allPosts = data?.pages.flatMap((p) => p.posts) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <div>
      {!searchQuery && !category && (
        <>
          <TrendRadar />
          <TrendingSection />
        </>
      )}

      <div className="flex items-center justify-between mb-3">
        <CategoryTabs selected={category} onChange={handleCategoryChange} />
      </div>

      {category === 'community' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1 overflow-hidden">
              <SourceFilterChips selected={selectedSources} onChange={setSelectedSources} />
            </div>
            <div className="flex bg-slate-100 rounded-lg p-0.5 flex-shrink-0 ml-3">
              <button
                onClick={() => setSortMode('trending')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  sortMode === 'trending'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                인기순
              </button>
              <button
                onClick={() => setSortMode('latest')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  sortMode === 'latest'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                최신순
              </button>
            </div>
          </div>
        </>
      )}

      {searchQuery && (
        <p className="text-sm text-slate-500 mb-3">
          &quot;{searchQuery}&quot; 검색 결과 {total.toLocaleString()}건
          {isFetching && !isFetchingNextPage && (
            <span className="ml-2 text-blue-500 animate-pulse">업데이트 중...</span>
          )}
        </p>
      )}

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-20 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : allPosts.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg mb-1">검색 결과가 없습니다</p>
          <p className="text-sm">다른 키워드로 검색해 보세요</p>
        </div>
      ) : (
        category === 'movie' ? (
          <MovieRankingTable posts={allPosts} />
        ) : category === 'performance' ? (
          <PerformanceRankingTable posts={allPosts} />
        ) : (
          <div className="grid gap-3">
            {allPosts.map((post, i) => (
              <PostCard
                key={post.id}
                post={post}
                rank={category === 'community' && sortMode === 'trending' ? i + 1 : undefined}
              />
            ))}
          </div>
        )
      )}

      <div ref={sentinelRef} className="h-10" />

      {category === 'video' && popularVideos && popularVideos.posts.length > 0 && (
        <div className="mt-6 mb-4">
          <h3 className="text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
            <span>🔥</span> 인기 급상승 영상
          </h3>
          <div className="grid gap-3">
            {popularVideos.posts.map((post, i) => (
              <PostCard key={post.id} post={post} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!hasNextPage && allPosts.length > 0 && (
        <p className="text-center text-sm text-slate-400 py-4">모든 글을 불러왔습니다</p>
      )}
    </div>
  );
};
