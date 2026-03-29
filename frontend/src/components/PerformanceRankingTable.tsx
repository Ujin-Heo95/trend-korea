import React from 'react';
import type { Post } from '../types';

interface PerformanceMeta {
  rank: number;
  genre: string;
  performanceName: string;
  venue: string;
  performanceId: string;
}

function parsePerformanceMeta(post: Post): PerformanceMeta | null {
  const m = post.metadata as PerformanceMeta | undefined;
  if (m?.performanceName) return m;

  // Fallback: parse title "[뮤지컬] 공연명 — 공연장"
  const match = post.title.match(/^\[(.+?)\]\s+(.+?)\s+—\s+(.+)$/);
  if (!match) return null;

  return {
    rank: post.view_count || 0,
    genre: match[1],
    performanceName: match[2],
    venue: match[3],
    performanceId: '',
  };
}

const GENRE_ORDER = ['뮤지컬', '연극', '대공연(콘서트)'];
const GENRE_ICONS: Record<string, string> = {
  '뮤지컬': '🎵',
  '연극': '🎭',
  '대공연(콘서트)': '🎤',
};

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

function GenreSection({ genre, items }: { genre: string; items: { post: Post; meta: PerformanceMeta }[] }) {
  const icon = GENRE_ICONS[genre] ?? '🎭';
  const sorted = [...items].sort((a, b) => a.meta.rank - b.meta.rank);

  return (
    <div className="mb-4 last:mb-0">
      <h3 className="text-sm font-semibold text-slate-700 px-4 py-2 bg-slate-50 border-b border-slate-100">
        {icon} {genre}
      </h3>

      {/* Desktop table */}
      <table className="w-full hidden sm:table">
        <thead>
          <tr className="text-xs text-slate-500 border-b border-slate-100">
            <th className="py-2 px-3 text-center w-14">순위</th>
            <th className="py-2 px-3 text-left">공연명</th>
            <th className="py-2 px-3 text-left w-40">공연장</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ post, meta }) => (
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
                  {meta.performanceName}
                </a>
              </td>
              <td className="py-3 px-3 text-sm text-slate-500">{meta.venue}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile list */}
      <div className="sm:hidden divide-y divide-slate-50">
        {sorted.map(({ post, meta }) => (
          <a
            key={post.id}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50/50 transition-colors"
          >
            <RankBadge rank={meta.rank} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{meta.performanceName}</p>
              <p className="text-xs text-slate-400 mt-0.5">{meta.venue}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export const PerformanceRankingTable: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const performances = posts
    .map(p => ({ post: p, meta: parsePerformanceMeta(p) }))
    .filter((m): m is { post: Post; meta: PerformanceMeta } => m.meta !== null);

  if (performances.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-lg mb-1">공연/전시 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  // Group by genre
  const genreMap = new Map<string, { post: Post; meta: PerformanceMeta }[]>();
  for (const item of performances) {
    const arr = genreMap.get(item.meta.genre);
    if (arr) arr.push(item);
    else genreMap.set(item.meta.genre, [item]);
  }

  // Sort genres by predefined order
  const orderedGenres = [...genreMap.keys()].sort((a, b) => {
    const ai = GENRE_ORDER.indexOf(a);
    const bi = GENRE_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <h2 className="text-base font-bold text-slate-800">🎭 공연 예매순위</h2>
        <p className="text-xs text-slate-400 mt-0.5">KOPIS 공연예술통합전산망 (주간 기준)</p>
      </div>

      {orderedGenres.map(genre => (
        <GenreSection key={genre} genre={genre} items={genreMap.get(genre)!} />
      ))}
    </div>
  );
};
