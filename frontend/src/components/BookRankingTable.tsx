import React, { useMemo } from 'react';
import type { Post } from '../types';
import { RankBadge } from './shared/RankBadge';
import { PosterImage } from './shared/PosterImage';
import { ExternalLinkButton } from './shared/ExternalLinkButton';

interface BookMeta {
  rank: number;
  title: string;
  author?: string;
  publisher?: string;
  price?: string;
  imageUrl?: string;
}

function parseBookMeta(post: Post): BookMeta | null {
  const m = post.metadata as BookMeta | undefined;
  if (m?.title && m?.rank) return m;

  const match = post.title.match(/^(\d+)위\s+(.+?)\s+—\s+(.+)$/);
  if (!match) return null;

  return { rank: parseInt(match[1], 10), title: match[2], author: match[3] };
}

export const BookRankingTable: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const books = useMemo(() =>
    posts
      .map(p => ({ post: p, meta: parseBookMeta(p) }))
      .filter((b): b is { post: Post; meta: BookMeta } => b.meta !== null)
      .sort((a, b) => a.meta.rank - b.meta.rank),
    [posts],
  );

  if (books.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">도서 베스트셀러 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  const sourceLabel = books[0].post.source_key === 'yes24_bestseller' ? 'YES24' : '알라딘';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">베스트셀러</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sourceLabel} TOP 30</p>
      </div>

      <table className="w-full hidden sm:table">
        <thead className="sticky top-0 bg-white dark:bg-slate-800 z-[5]">
          <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
            <th className="py-2 px-3 text-center w-14">순위</th>
            <th className="py-2 px-2 w-14"></th>
            <th className="py-2 px-3 text-left">도서명</th>
            <th className="py-2 px-3 text-left w-32">저자</th>
            <th className="py-2 px-3 text-left w-28">출판사</th>
            <th className="py-2 px-3 text-center w-20">바로가기</th>
          </tr>
        </thead>
        <tbody>
          {books.map(({ post, meta }) => (
            <tr key={post.id} className="border-b border-slate-50 dark:border-slate-700 hover:bg-amber-50/50 dark:hover:bg-amber-900/20 transition-colors">
              <td className="py-3 px-3 text-center"><RankBadge rank={meta.rank} /></td>
              <td className="py-3 px-2">
                <PosterImage src={post.thumbnail} alt={meta.title} width={40} height={56} fallbackIcon="📚" />
              </td>
              <td className="py-3 px-3">
                <a href={post.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-amber-600 transition-colors line-clamp-1">
                  {meta.title}
                </a>
              </td>
              <td className="py-3 px-3 text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{meta.author ?? ''}</td>
              <td className="py-3 px-3 text-sm text-slate-400 dark:text-slate-500 line-clamp-1">{meta.publisher ?? ''}</td>
              <td className="py-3 px-3 text-center">
                <ExternalLinkButton href={post.url} label={post.source_key === 'yes24_bestseller' ? 'YES24' : '알라딘'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sm:hidden divide-y divide-slate-50 dark:divide-slate-700">
        {books.map(({ post, meta }) => (
          <a key={post.id} href={post.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50/50 dark:hover:bg-amber-900/20 transition-colors">
            <RankBadge rank={meta.rank} />
            <PosterImage src={post.thumbnail} alt={meta.title} width={36} height={50} fallbackIcon="📚" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">{meta.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                {meta.author}{meta.publisher ? ` · ${meta.publisher}` : ''}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
