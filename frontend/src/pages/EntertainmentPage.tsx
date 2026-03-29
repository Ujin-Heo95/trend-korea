import React, { useState } from 'react';
import { useInfinitePosts } from '../hooks/usePosts';
import { MovieRankingTable } from '../components/MovieRankingTable';
import { PerformanceRankingTable } from '../components/PerformanceRankingTable';

type Tab = 'movie' | 'performance';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'movie', label: '영화', icon: '🎥' },
  { key: 'performance', label: '공연/전시', icon: '🎭' },
];

export const EntertainmentPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('movie');

  const { data, isLoading } = useInfinitePosts({ category: tab });
  const allPosts = data?.pages.flatMap((p) => p.posts) ?? [];

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
            }`}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-14 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : tab === 'movie' ? (
        <MovieRankingTable posts={allPosts} />
      ) : (
        <PerformanceRankingTable posts={allPosts} />
      )}
    </div>
  );
};
