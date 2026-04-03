import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useInfinitePosts } from '../hooks/usePosts';
import { fetchPosts, fetchLatestReport } from '../api/client';
import { AdSlot } from '../components/shared/AdSlot';
import { PostCard } from '../components/PostCard';
import { PostCardSkeleton } from '../components/shared/PostCardSkeleton';
import { TrendRadar } from '../components/TrendRadar';
import { MiniBriefing } from '../components/MiniBriefing';
const TrendHero = React.lazy(() => import('../components/TrendHero').then(m => ({ default: m.TrendHero })));
import { CategoryTabs } from '../components/CategoryTabs';
import { SourceFilterChips } from '../components/SourceFilterChips';
import { MovieRankingTable } from '../components/MovieRankingTable';
import { PerformanceRankingTable } from '../components/PerformanceRankingTable';
import { SnsRankingTable } from '../components/SnsRankingTable';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useReadPosts } from '../hooks/useReadPosts';
import { useVotes } from '../hooks/useVotes';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const CATEGORY_TITLES: Record<string, string> = {
  community: '커뮤니티',
  'news,press,newsletter': '뉴스',
  'tech,techblog': '테크',
  video: 'YouTube',
  'deals,sports,trend,government,finance,alert': '생활',
  movie: '박스오피스',
  performance: '공연/전시',
  sns: 'SNS',
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

      {!searchQuery && !category && (
        <>
          <React.Suspense fallback={<div className="h-40 animate-shimmer bg-slate-100 dark:bg-slate-800 rounded-xl mb-6" />}>
            <TrendHero />
          </React.Suspense>
          <TrendRadar />
          <MiniBriefing />
        </>
      )}

      <DailyReportPromo />

      <div className="flex items-center justify-between mb-3">
        <CategoryTabs selected={category} onChange={handleCategoryChange} />
      </div>

      {category === 'community' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1 overflow-hidden">
              <SourceFilterChips selected={selectedSources} onChange={setSelectedSources} />
            </div>
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
        category === 'movie' ? (
          <MovieRankingTable posts={allPosts} />
        ) : category === 'performance' ? (
          <PerformanceRankingTable posts={allPosts} />
        ) : category === 'sns' ? (
          <SnsRankingTable posts={allPosts} />
        ) : (
          <div className="grid gap-3">
            {allPosts.map((post, i) => (
              <React.Fragment key={post.id}>
                <PostCard
                  post={post}
                  rank={category === 'community' && sortMode === 'trending' ? i + 1 : undefined}
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

// ── 일일 리포트 프로모션 ──

function DailyReportPromo() {
  const { data: report } = useQuery({
    queryKey: ['latest-report-promo'],
    queryFn: fetchLatestReport,
    staleTime: 5 * 60_000,
  });

  if (!report) return null;

  return (
    <Link
      to={`/daily-report/${String(report.report_date).slice(0, 10)}`}
      className="block mb-4 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-600 transition-colors group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">📊</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
              {String(report.report_date).slice(0, 10)} 일일 트렌드 리포트
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">AI가 분석한 오늘의 한국 인터넷 핵심 이슈</p>
          </div>
        </div>
        <svg className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
