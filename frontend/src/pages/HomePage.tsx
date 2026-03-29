import React, { useRef, useEffect, useCallback } from 'react';
import { useInfinitePosts } from '../hooks/usePosts';
import { PostCard } from '../components/PostCard';
import { TrendingSection } from '../components/TrendingSection';
import { CategoryTabs } from '../components/CategoryTabs';
import type { Category } from '../types';

interface Props {
  category: Category | undefined;
  onCategoryChange: (cat: Category | undefined) => void;
  searchQuery: string;
}

export const HomePage: React.FC<Props> = ({ category, onCategoryChange, searchQuery }) => {
  const filter = {
    ...(category ? { category } : {}),
    ...(searchQuery ? { q: searchQuery } : {}),
  };

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isFetching,
  } = useInfinitePosts(filter);

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
      {!searchQuery && !category && <TrendingSection />}

      <div className="flex items-center justify-between mb-3">
        <CategoryTabs selected={category} onChange={onCategoryChange} />
      </div>

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
        <div className="grid gap-3">
          {allPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-10" />

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
