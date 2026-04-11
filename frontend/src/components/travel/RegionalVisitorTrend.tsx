import React, { useMemo } from 'react';
import type { Post } from '../../types';
import { RankBadge } from '../shared/RankBadge';

interface VisitorMeta {
  region: string;
  recentAvg: number;
  previousAvg: number;
  changePercent: number;
  latestCount: number;
  dataDate: string;
}

function parseMeta(post: Post): VisitorMeta | null {
  const m = post.metadata as VisitorMeta | undefined;
  if (m?.region && typeof m.changePercent === 'number') return m;
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

export const RegionalVisitorTrend: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const visitors = useMemo(() =>
    posts
      .filter(p => p.source_key === 'tour_visitor')
      .map(p => ({ post: p, meta: parseMeta(p) }))
      .filter((v): v is { post: Post; meta: VisitorMeta } => v.meta !== null)
      .sort((a, b) => {
        if (a.meta.changePercent >= 0 && b.meta.changePercent < 0) return -1;
        if (a.meta.changePercent < 0 && b.meta.changePercent >= 0) return 1;
        return Math.abs(b.meta.changePercent) - Math.abs(a.meta.changePercent);
      }),
    [posts],
  );

  if (visitors.length === 0) return null;

  const dataDate = visitors[0]?.meta.dataDate;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
          전국 방문객 트렌드
        </h3>
        {dataDate && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {formatDataDate(dataDate)} 기준
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
        최근 3일 평균 vs 이전 평균 방문객 변화율
      </p>

      {/* Desktop */}
      <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full hidden sm:table">
          <thead>
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
                <td className="py-2.5 px-3 text-center"><RankBadge rank={i + 1} /></td>
                <td className="py-2.5 px-3 text-sm font-medium text-slate-800 dark:text-slate-100">{meta.region}</td>
                <td className="py-2.5 px-3 text-right text-sm text-slate-600 dark:text-slate-300">{formatCount(meta.latestCount)}명</td>
                <td className="py-2.5 px-3 text-center"><ChangeIndicator percent={meta.changePercent} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile */}
        <div className="sm:hidden divide-y divide-slate-50 dark:divide-slate-700">
          {visitors.map(({ post, meta }, i) => (
            <div key={post.id} className="flex items-center gap-3 px-4 py-2.5">
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
    </section>
  );
};
