import React, { useMemo } from 'react';
import type { Post } from '../../types';
import { SeoulCongestionGrid } from './SeoulCongestionGrid';
import { FestivalEventList } from './FestivalEventList';
import { RegionalVisitorTrend } from './RegionalVisitorTrend';
import { PostCard } from '../PostCard';
import { AdSlot } from '../shared/AdSlot';

export const TravelDashboard: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const grouped = useMemo(() => {
    const map: Record<string, Post[]> = {};
    for (const p of posts) {
      (map[p.source_key] ??= []).push(p);
    }
    return map;
  }, [posts]);

  const congestionPosts = grouped['seoul_citydata'] ?? [];
  const festivalPosts = [
    ...(grouped['tour_festival'] ?? []),
    ...(grouped['seoul_cultural_event'] ?? []),
  ];
  const visitorPosts = grouped['tour_visitor'] ?? [];
  const newsPosts = grouped['traveltimes'] ?? [];

  const hasAny = congestionPosts.length > 0
    || festivalPosts.length > 0
    || visitorPosts.length > 0
    || newsPosts.length > 0;

  if (!hasAny) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">여행 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SeoulCongestionGrid posts={congestionPosts} />
      <FestivalEventList posts={festivalPosts} />
      <AdSlot slotId="travel-mid" format="native" className="my-1" />
      <RegionalVisitorTrend posts={visitorPosts} />
      {newsPosts.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
            여행 뉴스
          </h3>
          <div className="bg-white dark:bg-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
            {newsPosts.slice(0, 5).map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
