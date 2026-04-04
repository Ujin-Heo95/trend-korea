import React, { useState, useRef, useEffect, useCallback, useTransition, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useInfinitePosts } from '../hooks/usePosts';
import type { Post } from '../types';
import { fetchPosts } from '../api/client';
import { AdSlot } from '../components/shared/AdSlot';
import { PostCard } from '../components/PostCard';
import { PostCardSkeleton } from '../components/shared/PostCardSkeleton';
import { CategoryTabs } from '../components/CategoryTabs';
import { NewsSubcategoryTabs } from '../components/NewsSubcategoryTabs';
import { SourceFilterChips } from '../components/SourceFilterChips';
import { MovieRankingTable } from '../components/MovieRankingTable';
import { MusicRankingTable } from '../components/MusicRankingTable';
import { PerformanceRankingTable } from '../components/PerformanceRankingTable';
import { SnsRankingTable } from '../components/SnsRankingTable';
import { BookRankingTable } from '../components/BookRankingTable';
import { OttRankingTable } from '../components/OttRankingTable';
import { EntertainmentSubTabs, type EntertainmentSub } from '../components/EntertainmentSubTabs';
import { CommunityRankingList } from '../components/CommunityRankingList';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useReadPosts } from '../hooks/useReadPosts';
import { useVotes } from '../hooks/useVotes';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const CATEGORY_TITLES: Record<string, string> = {
  community: '커뮤니티',
  'news,press,newsletter,tech': '뉴스',
  video: 'YouTube',
  deals: '핫딜',
  entertainment: '엔터테인먼트',
  travel: '여행',
  sns: 'SNS',
};

const ENTERTAINMENT_CATEGORY_MAP: Record<EntertainmentSub, string> = {
  all: 'movie,performance,music,books,ott',
  books: 'books',
  ott: 'ott',
  music: 'music',
  movie: 'movie',
  performance: 'performance',
};

interface Props {
  category: string | undefined;
  onCategoryChange: (cat: string | undefined) => void;
  searchQuery: string;
}

export const HomePage: React.FC<Props> = ({ category, onCategoryChange, searchQuery }) => {
  useDocumentTitle(category ? CATEGORY_TITLES[category] : undefined);
  const { isRead, markAsRead } = useReadPosts();
  const { hasVoted, vote } = useVotes();
  const mainRef = useRef<HTMLDivElement>(null);
  usePullToRefresh(mainRef);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<'trending' | 'latest'>('trending');
  const [newsSubcategory, setNewsSubcategory] = useState<string | undefined>(undefined);
  const [entertainmentSub, setEntertainmentSub] = useState<EntertainmentSub>('all');
  const [, startTransition] = useTransition();
  const isNewsTab = category === 'news,press,newsletter,tech';
  const isEntertainmentTab = category === 'entertainment';
  const isAllTab = !category && !searchQuery;

  const handleCategoryChange = (cat: string | undefined) => {
    startTransition(() => {
      onCategoryChange(cat);
      setSelectedSources([]);
      setSortMode('trending');
      setNewsSubcategory(undefined);
      setEntertainmentSub('all');
    });
  };

  const resolvedCategory = isEntertainmentTab
    ? ENTERTAINMENT_CATEGORY_MAP[entertainmentSub]
    : category;

  const filter = {
    ...(resolvedCategory ? { category: resolvedCategory } : {}),
    ...(isNewsTab && newsSubcategory ? { subcategory: newsSubcategory } : {}),
    ...(searchQuery ? { q: searchQuery } : {}),
    ...(selectedSources.length > 0 ? { source: selectedSources.join(',') } : {}),
    ...(isAllTab || category === 'community' || isNewsTab ? { sort: sortMode } : {}),
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

  const allPosts = (() => {
    const raw = data?.pages.flatMap((p) => p.posts) ?? [];
    const seen = new Set<number>();
    return raw.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  })();
  const total = data?.pages[0]?.total ?? 0;

  // New posts detection
  const prevPostIdsRef = useRef<Set<number>>(new Set());
  const [newPostCount, setNewPostCount] = useState(0);

  useEffect(() => {
    if (allPosts.length === 0) return;
    const currentIds = new Set(allPosts.map(p => p.id));
    if (prevPostIdsRef.current.size > 0) {
      const newCount = [...currentIds].filter(id => !prevPostIdsRef.current.has(id)).length;
      if (newCount > 0) setNewPostCount(newCount);
    }
    prevPostIdsRef.current = currentIds;
  }, [allPosts]);

  return (
    <div ref={mainRef} style={{ overscrollBehaviorY: 'contain' }}>
      {/* New posts banner */}
      {newPostCount > 0 && (
        <button
          type="button"
          onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setNewPostCount(0); }}
          className="w-full mb-3 py-2 px-4 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors animate-scale-in"
        >
          {newPostCount}개 새 글이 있습니다
        </button>
      )}

      <div className="flex items-center justify-between mb-3">
        <CategoryTabs selected={category} onChange={handleCategoryChange} />
      </div>

      {isNewsTab && (
        <NewsSubcategoryTabs selected={newsSubcategory} onChange={setNewsSubcategory} />
      )}

      {isEntertainmentTab && (
        <EntertainmentSubTabs selected={entertainmentSub} onChange={setEntertainmentSub} />
      )}

      {(category === 'community' || isNewsTab) && (
        <>
          <div className="flex items-center justify-between mb-2">
            {category === 'community' ? (
              <div className="flex-1 overflow-hidden">
                <SourceFilterChips selected={selectedSources} onChange={setSelectedSources} />
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 flex-shrink-0 ml-3">
              <button
                onClick={() => setSortMode('trending')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  sortMode === 'trending'
                    ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                인기순
              </button>
              <button
                onClick={() => setSortMode('latest')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  sortMode === 'latest'
                    ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                최신순
              </button>
            </div>
          </div>
        </>
      )}

      {searchQuery && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          &quot;{searchQuery}&quot; 검색 결과 {total.toLocaleString()}건
          {isFetching && !isFetchingNextPage && (
            <span className="ml-2 text-blue-500 animate-pulse">업데이트 중...</span>
          )}
        </p>
      )}

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      ) : allPosts.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <p className="text-lg mb-1">검색 결과가 없습니다</p>
          <p className="text-sm">다른 키워드로 검색해 보세요</p>
        </div>
      ) : (
        isEntertainmentTab && entertainmentSub === 'movie' ? (
          <MovieRankingTable posts={allPosts} />
        ) : isEntertainmentTab && entertainmentSub === 'music' ? (
          <MusicRankingTable posts={allPosts} />
        ) : isEntertainmentTab && entertainmentSub === 'performance' ? (
          <PerformanceRankingTable posts={allPosts} />
        ) : isEntertainmentTab && entertainmentSub === 'books' ? (
          <BookRankingTable posts={allPosts} />
        ) : isEntertainmentTab && entertainmentSub === 'ott' ? (
          <OttRankingTable posts={allPosts} />
        ) : isEntertainmentTab && entertainmentSub === 'all' ? (
          <EntertainmentAllView posts={allPosts} />
        ) : category === 'sns' ? (
          <SnsRankingTable posts={allPosts} />
        ) : category === 'community' && selectedSources.length === 0 && sortMode === 'trending' ? (
          <CommunityRankingList posts={allPosts} isRead={isRead} onRead={markAsRead} />
        ) : (
          <div className="grid gap-3">
            {allPosts.map((post, i) => (
              <React.Fragment key={post.id}>
                <PostCard
                  post={post}
                  rank={(category === 'community' || isNewsTab) && sortMode === 'trending' ? i + 1 : undefined}
                  isRead={isRead(post.url)}
                  onRead={markAsRead}
                  hasVoted={hasVoted(post.id)}
                  onVote={vote}
                  style={i < 15 ? { '--enter-delay': `${i * 40}ms` } as React.CSSProperties : undefined}
                />
                {(i + 1) % 5 === 0 && <AdSlot slotId="home-infeed" format="native" className="my-1" />}
              </React.Fragment>
            ))}
          </div>
        )
      )}

      <div ref={sentinelRef} className="h-10" />

      {category === 'video' && popularVideos && popularVideos.posts.length > 0 && (
        <div className="mt-6 mb-4">
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <span>🔥</span> 인기 급상승 영상
          </h3>
          <div className="grid gap-3">
            {popularVideos.posts.map((post, i) => (
              <PostCard key={post.id} post={post} rank={i + 1} isRead={isRead(post.url)} onRead={markAsRead} />
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
        <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-4">모든 글을 불러왔습니다</p>
      )}
    </div>
  );
};

// ── 엔터테인먼트 전체 뷰 ──

function EntertainmentAllView({ posts }: { posts: Post[] }) {
  const grouped = useMemo(() => {
    const map: Record<string, Post[]> = {};
    for (const p of posts) {
      const cat = p.category ?? 'unknown';
      (map[cat] ??= []).push(p);
    }
    return map;
  }, [posts]);

  const sections: { key: string; label: string; component: React.ReactNode }[] = [
    grouped['movie']?.length ? { key: 'movie', label: '영화', component: <MovieRankingTable posts={grouped['movie']} /> } : null,
    grouped['music']?.length ? { key: 'music', label: '음악', component: <MusicRankingTable posts={grouped['music']} /> } : null,
    grouped['performance']?.length ? { key: 'perf', label: '공연', component: <PerformanceRankingTable posts={grouped['performance']} /> } : null,
    grouped['books']?.length ? { key: 'books', label: '도서', component: <BookRankingTable posts={grouped['books']} /> } : null,
    grouped['ott']?.length ? { key: 'ott', label: 'OTT', component: <OttRankingTable posts={grouped['ott']} /> } : null,
  ].filter((s): s is NonNullable<typeof s> => s !== null);

  if (sections.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">엔터테인먼트 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return <div className="space-y-6">{sections.map(s => <div key={s.key}>{s.component}</div>)}</div>;
}

