import React, { useState, useRef, useEffect, useCallback, useTransition, useMemo } from 'react';
import { useInfinitePosts } from '../hooks/usePosts';
import type { Post } from '../types';
import { AdSlot } from '../components/shared/AdSlot';
import { PostCard } from '../components/PostCard';
import { PostCardSkeleton } from '../components/shared/PostCardSkeleton';
import { CategoryTabs } from '../components/CategoryTabs';
import { NewsSubcategoryTabs } from '../components/NewsSubcategoryTabs';
import { SourceFilterChips } from '../components/SourceFilterChips';
import { MovieRankingTable } from '../components/MovieRankingTable';
import { MusicRankingTable } from '../components/MusicRankingTable';
import { PerformanceRankingTable } from '../components/PerformanceRankingTable';
import { BookRankingTable } from '../components/BookRankingTable';
import { OttRankingTable } from '../components/OttRankingTable';
import { WebtoonRankingTable } from '../components/WebtoonRankingTable';
import { EntertainmentSubTabs, type EntertainmentSub } from '../components/EntertainmentSubTabs';
import { EntertainmentCompactSection } from '../components/EntertainmentCompactSection';
import { EntertainmentUnifiedView } from '../components/EntertainmentUnifiedView';
import { CommunityRankingList } from '../components/CommunityRankingList';
import { IssueRankingList } from '../components/IssueRankingList';
import { MetaHead } from '../components/shared/MetaHead';
import { WebSiteJsonLd, CollectionPageJsonLd, DatasetJsonLd } from '../components/shared/JsonLd';
import { Breadcrumb } from '../components/shared/Breadcrumb';
import { useReadPosts } from '../hooks/useReadPosts';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { findCategoryComponent } from './categoryRegistry';
import type { CategoryContext } from './categoryRegistry';

const CATEGORY_TITLES: Record<string, string> = {
  community: '커뮤니티',
  'news,newsletter,tech': '뉴스',
  portal: '포털',
  video: 'YouTube',
  deals: '핫딜',
  entertainment: '엔터테인먼트',
};

const CATEGORY_LABELS: Record<string, string> = {
  community: '커뮤니티',
  'news,newsletter,tech': '뉴스',
  portal: '포털',
  video: '영상',
  deals: '핫딜',
  entertainment: '엔터테인먼트',
};

const ENTERTAINMENT_SUB_LABELS: Record<string, string> = {
  books: '도서',
  ott: 'OTT',
  music: '음악',
  movie: '영화',
  performance: '공연',
  webtoon: '웹툰',
};

const ENTERTAINMENT_CATEGORY_MAP: Record<EntertainmentSub, string> = {
  all: 'movie,performance,music,books,ott,webtoon',
  books: 'books',
  ott: 'ott',
  music: 'music',
  movie: 'movie',
  performance: 'performance',
  webtoon: 'webtoon',
};

interface Props {
  category: string | undefined;
  onCategoryChange: (cat: string | undefined) => void;
  searchQuery: string;
}

export const HomePage: React.FC<Props> = ({ category, onCategoryChange, searchQuery }) => {
  const pageTitle = category ? CATEGORY_TITLES[category] ?? '실시간 트렌드' : '실시간 트렌드';
  const { isRead, markAsRead } = useReadPosts();
  const mainRef = useRef<HTMLDivElement>(null);
  usePullToRefresh(mainRef);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<'trending' | 'latest'>('trending');
  const [newsSubcategory, setNewsSubcategory] = useState<string | undefined>(undefined);
  const [entertainmentSub, setEntertainmentSub] = useState<EntertainmentSub>('all');
  const [, startTransition] = useTransition();
  const isNewsTab = category === 'news,newsletter,tech';
  const isPortalTab = category === 'portal';
  const isEntertainmentTab = category === 'entertainment';
  const isVideoTab = category === 'video';
  const isDealsTab = category === 'deals';
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
    ...(isAllTab || category === 'community' || isNewsTab || isVideoTab ? { sort: sortMode } : {}),
  };

  const {
    data,
    dataUpdatedAt,
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

  const allPosts = useMemo(() => {
    const raw = data?.pages.flatMap((p) => p.posts) ?? [];
    const seen = new Set<number>();
    return raw.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt ?? data?.pages?.length]);
  const total = data?.pages[0]?.total ?? 0;

  const breadcrumbItems = useMemo(() => {
    if (!category) return null;
    const items: { label: string; href?: string }[] = [{ label: '홈', href: '/' }];
    const categoryLabel = CATEGORY_LABELS[category];
    if (!categoryLabel) return null;

    if (isEntertainmentTab && entertainmentSub !== 'all') {
      const subLabel = ENTERTAINMENT_SUB_LABELS[entertainmentSub];
      items.push({ label: categoryLabel, href: '/?category=entertainment' });
      if (subLabel) items.push({ label: subLabel });
      else items.push({ label: categoryLabel });
    } else if (isNewsTab && newsSubcategory) {
      items.push({ label: categoryLabel, href: '/?category=news,newsletter,tech' });
      items.push({ label: newsSubcategory });
    } else {
      items.push({ label: categoryLabel });
    }

    return items;
  }, [category, isEntertainmentTab, entertainmentSub, isNewsTab, newsSubcategory]);

  return (
    <div ref={mainRef} style={{ overscrollBehaviorY: 'contain' }}>
      <MetaHead title={pageTitle} />
      {isAllTab && (
        <>
          <WebSiteJsonLd />
          <DatasetJsonLd />
        </>
      )}
      {category && CATEGORY_TITLES[category] && (
        <CollectionPageJsonLd
          name={`${CATEGORY_TITLES[category]} — 위클릿`}
          description={`한국 ${CATEGORY_TITLES[category]} 실시간 트렌드`}
          url={`/?category=${category}`}
        />
      )}
      <div className="flex items-center justify-between mb-3">
        <CategoryTabs selected={category} onChange={handleCategoryChange} />
      </div>

      {breadcrumbItems && <Breadcrumb items={breadcrumbItems} />}

      {isNewsTab && (
        <NewsSubcategoryTabs selected={newsSubcategory} onChange={setNewsSubcategory} />
      )}

      {isEntertainmentTab && (
        <EntertainmentSubTabs selected={entertainmentSub} onChange={setEntertainmentSub} />
      )}

      {(category === 'community' || isNewsTab || isPortalTab || isDealsTab) && (
        <SourceFilterChips category={category!} selected={selectedSources} onChange={setSelectedSources} />
      )}

      {(category === 'community' || isNewsTab || isVideoTab) && (
        <div className="flex justify-end mb-3 px-1">
          <div className="flex gap-1.5">
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
        <div className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
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
        (() => {
          const ctx: CategoryContext = { category, isEntertainmentTab, isPortalTab, entertainmentSub, selectedSources, sortMode };
          const matched = findCategoryComponent(ctx);
          if (matched === 'MovieRankingTable') return <MovieRankingTable posts={allPosts} />;
          if (matched === 'MusicRankingTable') return <MusicRankingTable posts={allPosts} />;
          if (matched === 'PerformanceRankingTable') return <PerformanceRankingTable posts={allPosts} />;
          if (matched === 'BookRankingTable') return <BookRankingTable posts={allPosts} />;
          if (matched === 'OttRankingTable') return <OttRankingTable posts={allPosts} />;
          if (matched === 'WebtoonRankingTable') return <WebtoonRankingTable posts={allPosts} />;
          if (matched === 'EntertainmentAllView') return <EntertainmentUnifiedView onSubTabChange={setEntertainmentSub} />;
          if (matched === 'CommunityRankingList') return <CommunityRankingList posts={allPosts} isRead={isRead} onRead={markAsRead} />;
          return (
            <div className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
              {allPosts.map((post, i) => (
                <React.Fragment key={post.id}>
                  <PostCard
                    post={post}
                    rank={(isPortalTab || isDealsTab || ((category === 'community' || isNewsTab || isVideoTab) && sortMode === 'trending')) ? i + 1 : undefined}
                    isRead={isRead(post.url)}
                    onRead={markAsRead}
                    style={i < 15 ? { '--enter-delay': `${i * 40}ms` } as React.CSSProperties : undefined}
                  />
                  {(i + 1) % 5 === 0 && <AdSlot slotId="home-infeed" format="native" className="my-1" />}
                </React.Fragment>
              ))}
            </div>
          );
        })()
      )}

      {!isAllTab && <div ref={sentinelRef} className="h-10" />}

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

const ENTERTAINMENT_SECTION_ORDER = ['movie', 'music', 'performance', 'books', 'ott', 'webtoon'];

function EntertainmentAllView({ posts, onSubTabChange }: { posts: Post[]; onSubTabChange: (sub: EntertainmentSub) => void }) {
  const grouped = useMemo(() => {
    const map: Record<string, Post[]> = {};
    for (const p of posts) {
      const cat = p.category ?? 'unknown';
      (map[cat] ??= []).push(p);
    }
    return map;
  }, [posts]);

  const categories = ENTERTAINMENT_SECTION_ORDER.filter(cat => grouped[cat]?.length);

  if (categories.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">엔터테인먼트 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {categories.map(cat => (
        <EntertainmentCompactSection
          key={cat}
          category={cat}
          posts={grouped[cat]}
          onSubTabChange={onSubTabChange}
        />
      ))}
    </div>
  );
}


