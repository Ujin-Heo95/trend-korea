import React, { useMemo, useState } from 'react';
import type { Post } from '../types';
import { RankBadge } from './shared/RankBadge';

interface OttMeta {
  rank: number;
  title: string;
  platform: string;
  type: string;
  changeLabel: string;
  globalRank?: number;
}

function parseOttMeta(post: Post): OttMeta | null {
  const m = post.metadata as OttMeta | undefined;
  if (m?.title && m?.platform) return m;

  // Fallback: "Netflix 1위 타이틀 (—)"
  const match = post.title.match(/^(Netflix|Disney\+)\s+(\d+)위\s+(.+?)\s+\((.+?)\)$/);
  if (!match) return null;

  return { rank: parseInt(match[2], 10), title: match[3], platform: match[1], type: 'unknown', changeLabel: match[4] };
}

const PLATFORM_STYLES: Record<string, string> = {
  'Netflix': 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  'Disney+': 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
};

const TYPE_LABELS: Record<string, string> = {
  movie: '영화',
  series: '시리즈',
  mixed: '전체',
  kids: '키즈',
};

export const OttRankingTable: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const allItems = useMemo(() =>
    posts
      .map(p => ({ post: p, meta: parseOttMeta(p) }))
      .filter((o): o is { post: Post; meta: OttMeta } => o.meta !== null)
      .sort((a, b) => (a.meta.rank ?? 999) - (b.meta.rank ?? 999) || a.meta.platform.localeCompare(b.meta.platform)),
    [posts],
  );

  const platforms = useMemo(() => [...new Set(allItems.map(i => i.meta.platform))], [allItems]);
  const types = useMemo(() => [...new Set(allItems.map(i => i.meta.type))].filter(t => t !== 'unknown'), [allItems]);

  const items = useMemo(() =>
    allItems
      .filter(i => platformFilter === 'all' || i.meta.platform === platformFilter)
      .filter(i => typeFilter === 'all' || i.meta.type === typeFilter),
    [allItems, platformFilter, typeFilter],
  );

  if (allItems.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">OTT 순위 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">OTT 순위</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Netflix + Disney+ (FlixPatrol) · {items.length}개</p>

        {/* Platform filter */}
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={() => setPlatformFilter('all')}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              platformFilter === 'all'
                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}
          >
            전체
          </button>
          {platforms.map(p => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                platformFilter === p
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Type filter */}
        {types.length > 1 && (
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                typeFilter === 'all'
                  ? 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              전체 유형
            </button>
            {types.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  typeFilter === t
                    ? 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                {TYPE_LABELS[t] ?? t}
              </button>
            ))}
          </div>
        )}
      </div>

      <table className="w-full hidden sm:table">
        <thead className="sticky top-0 bg-white dark:bg-slate-800 z-[5]">
          <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
            <th className="py-2 px-3 text-center w-14">순위</th>
            <th className="py-2 px-3 text-left">제목</th>
            <th className="py-2 px-3 text-center w-24">플랫폼</th>
            <th className="py-2 px-3 text-center w-20">유형</th>
            <th className="py-2 px-3 text-center w-20">변동</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ post, meta }) => (
            <tr key={post.id} className="border-b border-slate-50 dark:border-slate-700 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-colors min-h-[44px]">
              <td className="py-3 px-3 text-center"><RankBadge rank={meta.rank} /></td>
              <td className="py-3 px-3">
                <a href={post.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-purple-600 transition-colors line-clamp-1">
                  {meta.title}
                </a>
              </td>
              <td className="py-3 px-3 text-center">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PLATFORM_STYLES[meta.platform] ?? 'bg-slate-100 text-slate-600'}`}>
                  {meta.platform}
                </span>
              </td>
              <td className="py-3 px-3 text-center text-xs text-slate-500 dark:text-slate-400">
                {TYPE_LABELS[meta.type] ?? meta.type}
              </td>
              <td className="py-3 px-3 text-center text-xs font-medium">
                <ChangeLabel label={meta.changeLabel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sm:hidden divide-y divide-slate-50 dark:divide-slate-700">
        {items.map(({ post, meta }) => (
          <a key={post.id} href={post.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 min-h-[44px] hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-colors">
            <RankBadge rank={meta.rank} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">{meta.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${PLATFORM_STYLES[meta.platform] ?? 'bg-slate-100 text-slate-600'}`}>
                  {meta.platform}
                </span>
                <span className="text-xs text-slate-400">{TYPE_LABELS[meta.type] ?? meta.type}</span>
                <ChangeLabel label={meta.changeLabel} />
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

const ChangeLabel: React.FC<{ label: string }> = ({ label }) => {
  if (label === 'NEW') return <span className="text-blue-600 dark:text-blue-400 text-xs font-bold">NEW</span>;
  if (label.startsWith('▲')) return <span className="text-green-600 dark:text-green-400 text-xs">{label}</span>;
  if (label.startsWith('▼')) return <span className="text-red-500 dark:text-red-400 text-xs">{label}</span>;
  return <span className="text-slate-400 text-xs">{label}</span>;
};
