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
import { IssueRankingList } from '../components/IssueRankingList';
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

  return (
    <div ref={mainRef} style={{ overscrollBehaviorY: 'contain' }}>
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
          <div className="flex items-center justify-between mb-4">
            {category === 'community' ? (
              <div className="flex-1 overflow-hidden">
                <SourceFilterChips selected={selectedSources} onChange={setSelectedSources} />
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <div className="flex gap-1.5 flex-shrink-0 ml-3">
              <button
                onClick={() => setSortMode('trending')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  sortMode === 'trending'
                    ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-blue-200 dark:hover:border-blue-500'
                }`}
              >
                인기순
              </button>
              <button
                onClick={() => setSortMode('latest')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  sortMode === 'latest'
                    ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-blue-200 dark:hover:border-blue-500'
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

      {isAllTab ? (
        <IssueRankingList />
      ) : isLoading ? (
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

      {!isAllTab && <div ref={sentinelRef} className="h-10" />}

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

      {!isAllTab && isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isAllTab && !hasNextPage && allPosts.length > 0 && (
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

