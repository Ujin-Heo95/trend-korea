import React from 'react';
import type { Post } from '../types';

const PLATFORM_BADGES: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300' },
  x: { label: 'X', color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
  tiktok: { label: 'TikTok', color: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300' },
};

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(n);
}

interface Props {
  posts: Post[];
}

export const SnsRankingTable: React.FC<Props> = ({ posts }) => {
  if (posts.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">SNS 데이터를 수집 중입니다</p>
        <p className="text-sm">잠시 후 다시 확인해 주세요</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {posts.map((post) => {
        const platform = String(post.metadata?.platform ?? '');
        const badge = PLATFORM_BADGES[platform];

        return (
          <a
            key={post.id}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all"
          >
            {post.thumbnail && (
              <img
                src={post.thumbnail}
                alt={post.title}
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                loading="lazy"
              />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {badge && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>
                    {badge.label}
                  </span>
                )}
                {post.author && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{post.author}</span>
                )}
              </div>

              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug">
                {post.title}
              </p>

              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                {post.view_count > 0 && (
                  <span>{platform === 'instagram' ? '❤️' : '👁'} {formatCount(post.view_count)}</span>
                )}
                {post.comment_count > 0 && (
                  <span>💬 {formatCount(post.comment_count)}</span>
                )}
                {post.metadata?.retweets != null && Number(post.metadata.retweets) > 0 && (
                  <span>🔄 {formatCount(Number(post.metadata.retweets))}</span>
                )}
                {post.metadata?.shares != null && Number(post.metadata.shares) > 0 && (
                  <span>↗️ {formatCount(Number(post.metadata.shares))}</span>
                )}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
};
