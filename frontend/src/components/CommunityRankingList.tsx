import React from 'react';
import type { Post } from '../types';
import { getSourceColor } from '../constants/sourceColors';
import { formatCount } from '../utils/formatCount';

interface Props {
  posts: Post[];
  isRead?: (url: string) => boolean;
  onRead?: (url: string) => void;
}

export const CommunityRankingList: React.FC<Props> = ({ posts, isRead, onRead }) => (
  <div className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700/50">
    {posts.map((post, i) => {
      const rank = i + 1;
      const read = isRead?.(post.url);
      return (
        <a
          key={post.id}
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onRead?.(post.url)}
          className={`flex gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group ${
            read ? 'opacity-50' : ''
          }`}
        >
          {/* Rank + source badge */}
          <div className="flex-shrink-0 w-7 flex flex-col items-center gap-1 pt-0.5">
            <span className={`font-bold tabular-nums ${
              rank <= 3 ? 'text-amber-500 dark:text-amber-400 text-base' : 'text-slate-400 dark:text-slate-500 text-sm'
            }`}>
              {rank}
            </span>
            <span className={`text-[9px] font-medium px-1 py-0.5 rounded leading-none whitespace-nowrap ${getSourceColor(post.source_key, post.category)}`}>
              {post.source_name}
            </span>
          </div>

          {/* Content: title-first layout */}
          <div className="flex-1 min-w-0">
            {/* Title — prominent, up to 2 lines */}
            <p className={`text-base leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 ${
              read ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-50'
            }`}>
              {post.title}
            </p>
            {/* Metrics row: views / likes / comments */}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              {post.view_count > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {formatCount(post.view_count)}
                </span>
              )}
              {post.like_count > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                  {post.like_count.toLocaleString()}
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
            </div>
          </div>
        </a>
      );
    })}
  </div>
);
