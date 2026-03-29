import React from 'react';
import type { Post } from '../types';

interface MovieMeta {
  rank: number;
  movieName: string;
  openDate: string;
  dailyAudience: number;
  accumulatedAudience: number;
  rankChange: number;
  isNew: boolean;
}

function parseMovieMeta(post: Post): MovieMeta | null {
  const m = post.metadata as MovieMeta | undefined;
  if (m?.movieName) return m;

  // Fallback: parse title "3위 영화명 (▲2) — 일 12,345명"
  const match = post.title.match(/^(\d+)위\s+(.+?)\s+\((.+?)\)\s+—\s+일\s+(.+?)명$/);
  if (!match) return null;

  const rankChange = match[3] === '🆕' ? 0
    : match[3].startsWith('▲') ? parseInt(match[3].slice(1), 10)
    : match[3].startsWith('▼') ? -parseInt(match[3].slice(1), 10) : 0;

  return {
    rank: parseInt(match[1], 10),
    movieName: match[2],
    openDate: '',
    dailyAudience: parseInt(match[4].replace(/,/g, ''), 10),
    accumulatedAudience: post.view_count,
    rankChange,
    isNew: match[3] === '🆕',
  };
}

function RankBadge({ rank }: { rank: number }) {
  const medals = ['🥇', '🥈', '🥉'];
  if (rank <= 3) {
    return <span className="text-lg">{medals[rank - 1]}</span>;
  }
  return (
    <span className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 text-sm font-bold">
      {rank}
    </span>
  );
}

function RankChangeLabel({ change, isNew }: { change: number; isNew: boolean }) {
  if (isNew) return <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">NEW</span>;
  if (change > 0) return <span className="text-xs text-red-500 font-medium">▲{change}</span>;
  if (change < 0) return <span className="text-xs text-blue-500 font-medium">▼{Math.abs(change)}</span>;
  return <span className="text-xs text-slate-400">-</span>;
}

export const MovieRankingTable: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const movies = posts
    .map(p => ({ post: p, meta: parseMovieMeta(p) }))
    .filter((m): m is { post: Post; meta: MovieMeta } => m.meta !== null)
    .sort((a, b) => a.meta.rank - b.meta.rank);

  if (movies.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-lg mb-1">영화 박스오피스 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <h2 className="text-base font-bold text-slate-800">🎥 일일 박스오피스</h2>
        <p className="text-xs text-slate-400 mt-0.5">KOBIS 영화진흥위원회 (전일 기준)</p>
      </div>

      {/* Desktop table */}
      <table className="w-full hidden sm:table">
        <thead>
          <tr className="text-xs text-slate-500 border-b border-slate-100">
            <th className="py-2 px-3 text-center w-14">순위</th>
            <th className="py-2 px-3 text-left">영화명</th>
            <th className="py-2 px-3 text-center w-16">변동</th>
            <th className="py-2 px-3 text-right w-28">일일 관객</th>
            <th className="py-2 px-3 text-right w-28">누적 관객</th>
          </tr>
        </thead>
        <tbody>
          {movies.map(({ post, meta }) => (
            <tr key={post.id} className="border-b border-slate-50 hover:bg-blue-50/50 transition-colors">
              <td className="py-3 px-3 text-center">
                <RankBadge rank={meta.rank} />
              </td>
              <td className="py-3 px-3">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-slate-800 hover:text-blue-600 transition-colors"
                >
                  {meta.movieName}
                </a>
                {meta.openDate && (
                  <span className="text-xs text-slate-400 ml-2">
                    {meta.openDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')} 개봉
                  </span>
                )}
              </td>
              <td className="py-3 px-3 text-center">
                <RankChangeLabel change={meta.rankChange} isNew={meta.isNew} />
              </td>
              <td className="py-3 px-3 text-right text-sm tabular-nums text-slate-700">
                {meta.dailyAudience.toLocaleString()}명
              </td>
              <td className="py-3 px-3 text-right text-sm tabular-nums text-slate-500">
                {meta.accumulatedAudience.toLocaleString()}명
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile list */}
      <div className="sm:hidden divide-y divide-slate-50">
        {movies.map(({ post, meta }) => (
          <a
            key={post.id}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50/50 transition-colors"
          >
            <RankBadge rank={meta.rank} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{meta.movieName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <RankChangeLabel change={meta.rankChange} isNew={meta.isNew} />
                <span className="text-xs text-slate-400">
                  일 {meta.dailyAudience.toLocaleString()}명 · 누적 {meta.accumulatedAudience.toLocaleString()}명
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
