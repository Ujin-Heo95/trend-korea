import React, { useMemo, useState } from 'react';
import type { Post } from '../types';
import { RankBadge } from './shared/RankBadge';

interface VisitorMeta {
  region: string;
  recentAvg: number;
  previousAvg: number;
  changePercent: number;
  latestCount: number;
  dataDate: string;
}

interface DestinationMeta {
  description: string;
  spatialCoverage: string;
  reference: string;
}

type ViewMode = 'visitor' | 'destination';

function parseVisitorMeta(post: Post): VisitorMeta | null {
  const m = post.metadata as VisitorMeta | undefined;
  if (m?.region && typeof m.changePercent === 'number') return m;
  return null;
}

function parseDestinationMeta(post: Post): DestinationMeta | null {
  const m = post.metadata as DestinationMeta | undefined;
  if (m?.spatialCoverage) return m;
  return null;
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return n.toLocaleString();
}

function formatDataDate(d: string): string {
  if (d.length !== 8) return d;
  return `${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function ChangeIndicator({ percent }: { percent: number }) {
  if (percent > 0) {
    return <span className="text-sm font-semibold text-red-500">▲ {percent.toFixed(1)}%</span>;
  }
  if (percent < 0) {
    return <span className="text-sm font-semibold text-blue-500">▼ {Math.abs(percent).toFixed(1)}%</span>;
  }
  return <span className="text-sm text-slate-400">-</span>;
}

export const TravelHotplaceView: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const hasVisitors = posts.some(p => p.source_key === 'tour_visitor');
  const hasDestinations = posts.some(p => p.source_key === 'kcisa_travel');
  const [mode, setMode] = useState<ViewMode>(hasVisitors ? 'visitor' : 'destination');

  const visitors = useMemo(() =>
    posts
      .filter(p => p.source_key === 'tour_visitor')
      .map(p => ({ post: p, meta: parseVisitorMeta(p) }))
      .filter((v): v is { post: Post; meta: VisitorMeta } => v.meta !== null)
      .sort((a, b) => Math.abs(b.meta.changePercent) - Math.abs(a.meta.changePercent)),
    [posts],
  );

  const destinations = useMemo(() =>
    posts
      .filter(p => p.source_key === 'kcisa_travel')
      .map(p => ({ post: p, meta: parseDestinationMeta(p) }))
      .filter((d): d is { post: Post; meta: DestinationMeta } => d.meta !== null),
    [posts],
  );

  const showToggle = hasVisitors && hasDestinations;

  return (
    <div className="space-y-3">
      {showToggle && (
        <div className="flex gap-1.5">
          <button
            onClick={() => setMode('visitor')}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              mode === 'visitor'
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}
          >
            방문객 트렌드
          </button>
          <button
            onClick={() => setMode('destination')}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              mode === 'destination'
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}
          >
            추천여행지
          </button>
        </div>
      )}

      {mode === 'visitor' ? (
        <VisitorTable visitors={visitors} />
      ) : (
        <DestinationList destinations={destinations} />
      )}
    </div>
  );
};

// ── 방문객 트렌드 테이블 ──

function VisitorTable({ visitors }: { visitors: { post: Post; meta: VisitorMeta }[] }) {
  if (visitors.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">방문객 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  const dataDate = visitors[0]?.meta.dataDate;

  return (
    <div className="bg-white dark:bg-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
          지역별 방문객 트렌드
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          최근 3일 평균 vs 이전 평균{dataDate ? ` (${formatDataDate(dataDate)} 기준)` : ''}
        </p>
      </div>

      {/* Desktop */}
      <table className="w-full hidden sm:table">
        <thead className="sticky top-0 bg-white dark:bg-slate-800 z-[5]">
          <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
            <th className="py-2 px-3 text-center w-14">순위</th>
            <th className="py-2 px-3 text-left">지역</th>
            <th className="py-2 px-3 text-right w-28">최근 방문객</th>
            <th className="py-2 px-3 text-center w-24">변화율</th>
          </tr>
        </thead>
        <tbody>
          {visitors.map(({ post, meta }, i) => (
            <tr key={post.id} className="border-b border-slate-50 dark:border-slate-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors">
              <td className="py-3 px-3 text-center">
                <RankBadge rank={i + 1} />
              </td>
              <td className="py-3 px-3">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {meta.region}
                </span>
              </td>
              <td className="py-3 px-3 text-right text-sm text-slate-600 dark:text-slate-300">
                {formatCount(meta.latestCount)}명
              </td>
              <td className="py-3 px-3 text-center">
                <ChangeIndicator percent={meta.changePercent} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile */}
      <div className="sm:hidden divide-y divide-slate-50 dark:divide-slate-700">
        {visitors.map(({ post, meta }, i) => (
          <div key={post.id} className="flex items-center gap-3 px-4 py-3">
            <RankBadge rank={i + 1} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{meta.region}</p>
              <p className="text-xs text-slate-400 mt-0.5">{formatCount(meta.latestCount)}명</p>
            </div>
            <ChangeIndicator percent={meta.changePercent} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 추천여행지 카드 ──

function DestinationList({ destinations }: { destinations: { post: Post; meta: DestinationMeta }[] }) {
  if (destinations.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">추천여행지 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {destinations.map(({ post, meta }) => (
        <a
          key={post.id}
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white dark:bg-slate-800 px-4 py-3 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                {post.title}
              </h3>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                {meta.spatialCoverage}
              </span>
              {meta.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">
                  {meta.description}
                </p>
              )}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
