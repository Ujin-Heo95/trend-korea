import React, { useMemo, useState } from 'react';
import type { Post } from '../types';
import { RankBadge } from './shared/RankBadge';
import { PosterImage } from './shared/PosterImage';
import { ExternalLinkButton } from './shared/ExternalLinkButton';

interface MusicMeta {
  rank: number;
  title: string;
  artist: string;
  album?: string;
  songNo?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  melon_chart: '멜론',
  bugs_chart: '벅스',
  genie_chart: '지니',
  kworb_spotify_kr: 'Spotify',
};

function parseMusicMeta(post: Post): MusicMeta | null {
  const m = post.metadata as MusicMeta | undefined;
  if (m?.title && m?.artist) return m;

  // Fallback: parse title "1위 곡명 — 아티스트"
  const match = post.title.match(/^(\d+)위\s+(.+?)\s+—\s+(.+)$/);
  if (!match) return null;

  return {
    rank: parseInt(match[1], 10),
    title: match[2],
    artist: match[3],
  };
}

export const MusicRankingTable: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const [sourceFilter, setSourceFilter] = useState<string | undefined>(undefined);

  const availableSources = useMemo(() => {
    const keys = new Set(posts.map(p => p.source_key));
    return Object.entries(SOURCE_LABELS).filter(([k]) => keys.has(k));
  }, [posts]);

  const songs = useMemo(() =>
    posts
      .filter(p => !sourceFilter || p.source_key === sourceFilter)
      .map(p => ({ post: p, meta: parseMusicMeta(p) }))
      .filter((m): m is { post: Post; meta: MusicMeta } => m.meta !== null)
      .sort((a, b) => a.meta.rank - b.meta.rank),
    [posts, sourceFilter],
  );

  const activeSourceLabel = sourceFilter ? (SOURCE_LABELS[sourceFilter] ?? sourceFilter) : '전체';

  if (songs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">음악 차트 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* 헤더 + 소스 필터 */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{activeSourceLabel} 실시간 차트</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{activeSourceLabel} TOP 30</p>
        {availableSources.length > 1 && (
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => setSourceFilter(undefined)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                !sourceFilter
                  ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              전체
            </button>
            {availableSources.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSourceFilter(key)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  sourceFilter === key
                    ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop table */}
      <table className="w-full hidden sm:table">
        <thead className="sticky top-0 bg-white dark:bg-slate-800 z-[5]">
          <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
            <th className="py-2 px-3 text-center w-14">순위</th>
            <th className="py-2 px-2 w-14"></th>
            <th className="py-2 px-3 text-left">곡명</th>
            <th className="py-2 px-3 text-left w-40">아티스트</th>
            <th className="py-2 px-3 text-left w-40">앨범</th>
            <th className="py-2 px-3 text-center w-20">듣기</th>
          </tr>
        </thead>
        <tbody>
          {songs.map(({ post, meta }) => (
            <tr key={post.id} className="border-b border-slate-50 dark:border-slate-700 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 transition-colors">
              <td className="py-3 px-3 text-center">
                <RankBadge rank={meta.rank} />
              </td>
              <td className="py-3 px-2">
                <PosterImage
                  src={post.thumbnail}
                  alt={meta.title}
                  width={40}
                  height={40}
                  fallbackIcon="🎵"
                />
              </td>
              <td className="py-3 px-3">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-teal-600 transition-colors line-clamp-1"
                >
                  {meta.title}
                </a>
              </td>
              <td className="py-3 px-3 text-sm text-slate-500 dark:text-slate-400 line-clamp-1">
                {meta.artist}
              </td>
              <td className="py-3 px-3 text-sm text-slate-400 dark:text-slate-500 line-clamp-1">
                {meta.album ?? ''}
              </td>
              <td className="py-3 px-3 text-center">
                <ExternalLinkButton href={post.url} label={SOURCE_LABELS[post.source_key] ?? '듣기'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile list */}
      <div className="sm:hidden divide-y divide-slate-50 dark:divide-slate-700">
        {songs.map(({ post, meta }) => (
          <a
            key={post.id}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 transition-colors"
          >
            <RankBadge rank={meta.rank} />
            <PosterImage
              src={post.thumbnail}
              alt={meta.title}
              width={36}
              height={36}
              fallbackIcon="🎵"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">
                {meta.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                {meta.artist}{meta.album ? ` · ${meta.album}` : ''}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
