import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Post } from '../types';
import { getSourceColor } from '../constants/sourceColors';
import { ShareButton } from './shared/ShareButton';
import { VoteButton } from './shared/VoteButton';
import { BookmarkButton } from './shared/BookmarkButton';
import { optimizedImage } from '../utils/imageProxy';
import { timeAgo } from '../utils/timeAgo';
import { formatCount } from '../utils/formatCount';

const NEWS_CATEGORIES = ['news', 'press', 'newsletter', 'tech', 'finance'];

interface PostCardProps {
  post: Post;
  rank?: number;
  isRead?: boolean;
  onRead?: (url: string) => void;
  hasVoted?: boolean;
  onVote?: (postId: number, onCountUpdate?: (count: number) => void) => void;
  style?: React.CSSProperties;
}

export const PostCard: React.FC<PostCardProps> = React.memo(({ post, rank, isRead, onRead, hasVoted, onVote, style }) => {
  const [expanded, setExpanded] = useState(false);
  const clusterSize = post.cluster_size ?? 1;
  const hasClusters = clusterSize > 1;

  return (
    <div
      className={`border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors animate-card-enter ${
        isRead ? 'opacity-60' : ''
      }`}
      style={style}
    >
      {/* Clickable content area */}
      {(() => {
        const isNews = NEWS_CATEGORIES.includes(post.category ?? '');
        const isExternalLink = post.category === 'community' || isNews;
        const content = (
          <div className="flex gap-3">
            {/* Rank number + source badge */}
            {rank != null && (
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
            )}

            {/* Thumbnail */}
            {post.thumbnail && (
              <div className="flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                <img src={optimizedImage(post.thumbnail, 128)} alt="" loading="lazy" decoding="async" width={64} height={48} className="w-full h-full object-cover" />
              </div>
            )}

            {/* Content: title-first */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 ${
                isRead ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-50'
              }`}>
                {post.title}
              </p>
              {/* Metrics row */}
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
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
                {/* Source badge inline when no rank */}
                {rank == null && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getSourceColor(post.source_key, post.category)}`}>
                    {post.source_name}
                  </span>
                )}
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span>{timeAgo(post.published_at ?? post.first_scraped_at)}</span>
              </div>
            </div>
          </div>
        );
        return isExternalLink ? (
          <a href={post.url} target="_blank" rel="noopener noreferrer" onClick={() => onRead?.(post.url)} className="block px-4 py-2 group">
            {content}
          </a>
        ) : (
          <Link to={`/issue/${post.id}`} onClick={() => onRead?.(post.url)} className="block px-4 py-2 group">
            {content}
          </Link>
        );
      })()}

      {/* Action buttons + clusters — inline row (hidden for news) */}
      {(() => {
        const isNews = NEWS_CATEGORIES.includes(post.category ?? '');
        const showActions = !isNews && (onVote || true);
        const showCluster = hasClusters;
        if (!showActions && !showCluster) return null;
        return (
          <div className="flex items-center gap-2 px-4 pb-2 -mt-1">
            {!isNews && onVote && (
              <VoteButton postId={post.id} voteCount={post.vote_count} hasVoted={hasVoted ?? false} onVote={onVote} />
            )}
            {!isNews && <BookmarkButton post={post} />}
            {!isNews && <ShareButton url={post.url} title={post.title} thumbnail={post.thumbnail} />}
            {showCluster && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
              >
                외 {clusterSize - 1}개 소스 {expanded ? '▲' : '▼'}
              </button>
            )}
          </div>
        );
      })()}
      {expanded && post.related_sources && post.related_sources.length > 0 && (
        <div className="px-4 pb-3 ml-4 space-y-1 border-l-2 border-slate-200 dark:border-slate-600 pl-3">
          {post.related_sources.map((s) => {
            const isExternalSource = post.category === 'community' || NEWS_CATEGORIES.includes(post.category ?? '');
            return isExternalSource ? (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                <span className={`px-1.5 py-0.5 rounded ${getSourceColor(s.source_key)}`}>
                  {s.source_name}
                </span>
              </a>
            ) : (
              <Link
                key={s.url}
                to={`/issue/${s.id}`}
                className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                <span className={`px-1.5 py-0.5 rounded ${getSourceColor(s.source_key)}`}>
                  {s.source_name}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
});
