import React, { useMemo, useState } from 'react';
import type { Post } from '../types';
import { RankBadge } from './shared/RankBadge';
import { DataFreshnessLabel } from './shared/DataFreshnessLabel';
import { ExternalLinkButton } from './shared/ExternalLinkButton';
import { PosterImage } from './shared/PosterImage';

interface MovieMeta {
  rank: number;
  movieName: string;
  movieCd?: string;
  openDate: string;
  dailyAudience: number;
  accumulatedAudience: number;
  rankChange: number;
  isNew: boolean;
  dataDate?: string;
  posterUrl?: string;
  naverMovieUrl?: string;
  director?: string;
  userRating?: number;
  plotSummary?: string;
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

function formatOpenDate(raw: string): string {
  if (!raw) return '';
  return raw.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3');
}

function formatDataDate(dataDate?: string, publishedAt?: string): string {
  if (dataDate) {
    return dataDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3');
  }
  if (publishedAt) {
    return new Date(publishedAt).toISOString().slice(0, 10).replace(/-/g, '.');
  }
  return '';
}

function naverSearchUrl(movieName: string): string {
  return `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(movieName + ' 영화')}`;
}

function cgvSearchUrl(movieName: string): string {
  return `https://www.cgv.co.kr/search/?query=${encodeURIComponent(movieName)}`;
}

function RankChangeLabel({ change, isNew }: { change: number; isNew: boolean }) {
  if (isNew) return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">NEW</span>;
  if (change > 0) return <span className="text-xs text-red-500 font-medium">▲{change}</span>;
  if (change < 0) return <span className="text-xs text-blue-500 font-medium">▼{Math.abs(change)}</span>;
  return <span className="text-xs text-slate-400 dark:text-slate-500">-</span>;
}

type SortMode = 'rank' | 'accumulated';

export const MovieRankingTable: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const [sortMode, setSortMode] = useState<SortMode>('rank');

  const movies = useMemo(() => {
    const parsed = posts
      .map(p => ({ post: p, meta: parseMovieMeta(p) }))
      .filter((m): m is { post: Post; meta: MovieMeta } => m.meta !== null);

    return sortMode === 'accumulated'
      ? [...parsed].sort((a, b) => b.meta.accumulatedAudience - a.meta.accumulatedAudience)
      : [...parsed].sort((a, b) => a.meta.rank - b.meta.rank);
  }, [posts, sortMode]);

  if (movies.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">영화 박스오피스 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  const dataDateStr = formatDataDate(movies[0].meta.dataDate, movies[0].post.published_at);

  return (
    <div className="bg-white dark:bg-slate-800 overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">일일 박스오피스</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">KOBIS 영화진흥위원회</p>
          </div>
          <div className="flex items-center gap-2">
            {dataDateStr && <DataFreshnessLabel label={`${dataDateStr} 기준 (어제)`} />}
          </div>
        </div>
        {/* 정렬 토글 */}
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={() => setSortMode('rank')}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors border ${
              sortMode === 'rank'
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-blue-200 dark:hover:border-blue-500'
            }`}
          >
            관객순
          </button>
          <button
            onClick={() => setSortMode('accumulated')}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors border ${
              sortMode === 'accumulated'
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-blue-200 dark:hover:border-blue-500'
            }`}
          >
            누적순
          </button>
        </div>
      </div>

      {/* Desktop table */}
      <table className="w-full hidden sm:table">
        <thead className="sticky top-0 bg-white dark:bg-slate-800 z-[5]">
          <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
            <th className="py-2 px-3 text-center w-14">순위</th>
            <th className="py-2 px-2 w-14"></th>
            <th className="py-2 px-3 text-left">영화명</th>
            <th className="py-2 px-3 text-center w-14">변동</th>
            <th className="py-2 px-3 text-right w-28">일일 관객</th>
            <th className="py-2 px-3 text-right w-28">누적 관객</th>
            <th className="py-2 px-3 text-center w-28">바로가기</th>
          </tr>
        </thead>
        <tbody>
          {movies.map(({ post, meta }, idx) => {
            const displayRank = sortMode === 'accumulated' ? idx + 1 : meta.rank;
            return (
            <tr key={post.id} className="border-b border-slate-50 dark:border-slate-700 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors min-h-[44px]">
              <td className="py-3 px-3 text-center">
                <RankBadge rank={displayRank} />
              </td>
              <td className="py-3 px-2">
                <PosterImage
                  src={meta.posterUrl || post.thumbnail}
                  alt={meta.movieName}
                  width={40}
                  height={56}
                  fallbackIcon="🎬"
                />
              </td>
              <td className="py-3 px-3">
                <a
                  href={meta.naverMovieUrl || naverSearchUrl(meta.movieName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 transition-colors"
                >
                  {meta.movieName}
                </a>
                {meta.plotSummary && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{meta.plotSummary}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {meta.openDate && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {formatOpenDate(meta.openDate)} 개봉
                    </span>
                  )}
                  {meta.director && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">· {meta.director}</span>
                  )}
                  {meta.userRating != null && meta.userRating > 0 && (
                    <span className="text-xs text-amber-500 font-medium">★ {meta.userRating.toFixed(1)}</span>
                  )}
                </div>
              </td>
              <td className="py-3 px-3 text-center">
                <RankChangeLabel change={meta.rankChange} isNew={meta.isNew} />
              </td>
              <td className="py-3 px-3 text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                {meta.dailyAudience.toLocaleString()}명
              </td>
              <td className="py-3 px-3 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
                {meta.accumulatedAudience.toLocaleString()}명
              </td>
              <td className="py-3 px-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <ExternalLinkButton
                    href={meta.naverMovieUrl || naverSearchUrl(meta.movieName)}
                    label="네이버"
                  />
                  <ExternalLinkButton
                    href={cgvSearchUrl(meta.movieName)}
                    label="CGV"
                  />
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile list */}
      <div className="sm:hidden divide-y divide-slate-50 dark:divide-slate-700">
        {movies.map(({ post, meta }, idx) => {
          const displayRank = sortMode === 'accumulated' ? idx + 1 : meta.rank;
          return (
          <div key={post.id} className="flex items-start gap-3 px-4 py-3 min-h-[44px]">
            <RankBadge rank={displayRank} />
            <PosterImage
              src={meta.posterUrl || post.thumbnail}
              alt={meta.movieName}
              width={36}
              height={50}
              fallbackIcon="🎬"
            />
            <div className="flex-1 min-w-0">
              <a
                href={meta.naverMovieUrl || naverSearchUrl(meta.movieName)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 transition-colors line-clamp-1"
              >
                {meta.movieName}
              </a>
              {meta.plotSummary && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{meta.plotSummary}</p>
              )}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <RankChangeLabel change={meta.rankChange} isNew={meta.isNew} />
                {meta.openDate && (
                  <span className="text-xs text-slate-400">{formatOpenDate(meta.openDate)} 개봉</span>
                )}
                {meta.userRating != null && meta.userRating > 0 && (
                  <span className="text-xs text-amber-500 font-medium">★ {meta.userRating.toFixed(1)}</span>
                )}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                일 {meta.dailyAudience.toLocaleString()}명 · 누적 {meta.accumulatedAudience.toLocaleString()}명
              </p>
              <div className="flex gap-1.5 mt-1.5">
                <ExternalLinkButton
                  href={meta.naverMovieUrl || naverSearchUrl(meta.movieName)}
                  label="네이버"
                />
                <ExternalLinkButton
                  href={cgvSearchUrl(meta.movieName)}
                  label="CGV"
                />
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};
