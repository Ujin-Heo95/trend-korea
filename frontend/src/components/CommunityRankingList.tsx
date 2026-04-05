import React from 'react';
import { Link } from 'react-router-dom';
import type { Post } from '../types';
import { getSourceColor } from '../constants/sourceColors';
import { formatCount } from '../utils/formatCount';

interface Props {
  posts: Post[];
  isRead?: (url: string) => boolean;
  onRead?: (url: string) => void;
}

export const CommunityRankingList: React.FC<Props> = ({ posts, isRead, onRead }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm divide-y divide-slate-100 dark:divide-slate-700/50">
    {posts.map((post, i) => {
      const rank = i + 1;
      const read = isRead?.(post.url);
      return (
        <Link
          key={post.id}
          to={`/issue/${post.id}`}
          onClick={() => onRead?.(post.url)}
          className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group ${
            read ? 'opacity-50' : ''
          }`}
        >
          {/* Rank */}
          <span className={`flex-shrink-0 w-6 text-center text-sm font-bold tabular-nums ${
            rank <= 3 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
          }`}>
            {rank}
          </span>

          {/* Source badge */}
          <span className={`flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${getSourceColor(post.source_key, post.category)}`}>
            {post.source_name}
          </span>

          {/* Title */}
          <span className={`flex-1 min-w-0 text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 ${
            read ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'
          }`}>
            {post.title}
          </span>

          {/* Metrics */}
          <span className="flex-shrink-0 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            {post.view_count > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {formatCount(post.view_count)}
              </span>
            )}
            {post.comment_count > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {post.comment_count.toLocaleString()}
              </span>
            )}
          </span>
        </Link>
      );
    })}
  </div>
);
