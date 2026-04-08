import React, { useMemo } from 'react';
import type { Post } from '../types';
import { RankBadge } from './shared/RankBadge';

const PREVIEW_COUNT = 5;

const PORTAL_SECTIONS = [
  { key: 'naver_news_ranking', icon: '🟢', label: '네이버 뉴스 랭킹' },
  { key: 'nate_news',          icon: '🔴', label: '네이트 뉴스 랭킹' },
  { key: 'zum_news',           icon: '🟣', label: 'ZUM 뉴스 랭킹' },
  { key: 'google_news_kr',     icon: '🔵', label: 'Google 뉴스' },
] as const;

interface Props {
  posts: Post[];
  isRead?: (url: string) => boolean;
  onRead?: (url: string) => void;
  onSourceFilter: (sources: string[]) => void;
}

function getRank(post: Post, fallbackIndex: number): number {
  const m = post.metadata as Record<string, unknown> | undefined;
  return typeof m?.rank === 'number' ? m.rank : fallbackIndex + 1;
}

export const PortalRankingView: React.FC<Props> = ({ posts, isRead, onRead, onSourceFilter }) => {
  const grouped = useMemo(() => {
    const map: Record<string, Post[]> = {};
    for (const p of posts) {
      (map[p.source_key] ??= []).push(p);
    }
    // Sort each group by rank
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => getRank(a, 0) - getRank(b, 0));
    }
    return map;
  }, [posts]);

  const sections = PORTAL_SECTIONS.filter(s => grouped[s.key]?.length);

  if (sections.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">포털 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map(section => (
        <PortalSection
          key={section.key}
          icon={section.icon}
          label={section.label}
          posts={grouped[section.key].slice(0, PREVIEW_COUNT)}
          isRead={isRead}
          onRead={onRead}
          onMore={() => onSourceFilter([section.key])}
        />
      ))}
    </div>
  );
};

// ── Section ──

interface SectionProps {
  icon: string;
  label: string;
  posts: Post[];
  isRead?: (url: string) => boolean;
  onRead?: (url: string) => void;
  onMore: () => void;
}

const PortalSection: React.FC<SectionProps> = ({ icon, label, posts, isRead, onRead, onMore }) => (
  <div className="bg-white dark:bg-slate-800 overflow-hidden">
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
        {icon} {label}
      </h3>
      <button
        onClick={onMore}
        className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-medium transition-colors"
      >
        더보기 →
      </button>
    </div>
    <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
      {posts.map((post, i) => {
        const rank = getRank(post, i);
        const read = isRead?.(post.url);
        return (
          <a
            key={post.id}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onRead?.(post.url)}
            className={`flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
              read ? 'opacity-50' : ''
            }`}
          >
            <RankBadge rank={rank} />
            <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">
              {post.title}
            </span>
            {post.author && (
              <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 max-w-[100px] truncate">
                {post.author}
              </span>
            )}
          </a>
        );
      })}
    </div>
  </div>
);
