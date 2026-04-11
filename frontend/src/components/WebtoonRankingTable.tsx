import React, { useMemo } from 'react';
import type { Post } from '../types';
import { RankBadge } from './shared/RankBadge';
import { PosterImage } from './shared/PosterImage';

interface WebtoonMeta {
  rank: number;
  starScore: number;
  isNew: boolean;
}

function parseWebtoonMeta(post: Post): WebtoonMeta | null {
  const m = post.metadata as WebtoonMeta | undefined;
  if (m && typeof m.rank === 'number') return m;
  return null;
}

export const WebtoonRankingTable: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const webtoons = useMemo(() =>
    posts
      .map(p => ({ post: p, meta: parseWebtoonMeta(p) }))
      .filter((w): w is { post: Post; meta: WebtoonMeta } => w.meta !== null)
      .sort((a, b) => a.meta.rank - b.meta.rank),
    [posts],
  );

  if (webtoons.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">웹툰 랭킹 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">네이버 웹툰 인기 랭킹</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">오늘의 요일 웹툰 TOP {webtoons.length} (별점순)</p>
      </div>

      {/* Desktop table */}
      <table className="w-full hidden sm:table">
        <thead className="sticky top-0 bg-white dark:bg-slate-800 z-[5]">
          <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
            <th className="py-2 px-3 text-center w-14">순위</th>
            <th className="py-2 px-2 w-14"></th>
            <th className="py-2 px-3 text-left">제목</th>
            <th className="py-2 px-3 text-left w-32">작가</th>
            <th className="py-2 px-3 text-center w-20">별점</th>
            <th className="py-2 px-3 text-center w-16">상태</th>
          </tr>
        </thead>
        <tbody>
          {webtoons.map(({ post, meta }) => (
            <tr key={post.id} className="border-b border-slate-50 dark:border-slate-700 hover:bg-green-50/50 dark:hover:bg-green-900/20 transition-colors min-h-[44px]">
              <td className="py-3 px-3 text-center">
                <RankBadge rank={meta.rank} />
              </td>
              <td className="py-3 px-2">
                <PosterImage
                  src={post.thumbnail}
                  alt={post.title}
                  width={40}
                  height={40}
                  fallbackIcon="📖"
                />
              </td>
              <td className="py-3 px-3">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-green-600 transition-colors line-clamp-1"
                >
                  {post.title}
                </a>
              </td>
              <td className="py-3 px-3 text-sm text-slate-500 dark:text-slate-400 line-clamp-1">
                {post.author ?? ''}
              </td>
              <td className="py-3 px-3 text-center">
                <span className="text-xs text-amber-500 font-medium">★ {meta.starScore.toFixed(2)}</span>
              </td>
              <td className="py-3 px-3 text-center">
                {meta.isNew && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">UP</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile list */}
      <div className="sm:hidden divide-y divide-slate-50 dark:divide-slate-700">
        {webtoons.map(({ post, meta }) => (
          <a
            key={post.id}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 min-h-[44px] hover:bg-green-50/50 dark:hover:bg-green-900/20 transition-colors"
          >
            <RankBadge rank={meta.rank} />
            <PosterImage
              src={post.thumbnail}
              alt={post.title}
              width={36}
              height={36}
              fallbackIcon="📖"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">
                {post.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500 dark:text-slate-400">{post.author}</span>
                <span className="text-xs text-amber-500 font-medium">★ {meta.starScore.toFixed(2)}</span>
                {meta.isNew && (
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-1 py-0.5 rounded">UP</span>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
