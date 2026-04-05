import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Post } from '../types';
import { getSourceColor } from '../constants/sourceColors';
import { ShareButton } from './shared/ShareButton';
import { VoteButton } from './shared/VoteButton';
import { BookmarkButton } from './shared/BookmarkButton';
import { optimizedImage } from '../utils/imageProxy';
import { timeAgo } from '../utils/timeAgo';

const RANK_STYLES: Record<number, string> = {
  1: 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-sm',
  2: 'bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm',
  3: 'bg-gradient-to-br from-orange-400 to-amber-600 text-white shadow-sm',
};

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

  const rankStyle = rank != null && rank <= 3
    ? RANK_STYLES[rank]
    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400';

  return (
    <div
      className={`border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors animate-card-enter ${
        isRead ? 'opacity-60' : ''
      }`}
      style={style}
    >
      {/* Clickable content area */}
      <Link
        to={`/issue/${post.id}`}
        onClick={() => onRead?.(post.url)}
        className="flex items-start gap-3 p-4 group"
      >
        {rank != null && (
          <span className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${rankStyle}`}>
            {rank}
          </span>
        )}
        {post.thumbnail && (
          <div className="flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
            <img src={optimizedImage(post.thumbnail, 128)} alt={post.title} loading="lazy" decoding="async" width={64} height={48} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getSourceColor(post.source_key, post.category)}`}>
              {post.source_name}
            </span>
            {post.view_count > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">조회 {post.view_count.toLocaleString()}</span>
            )}
            {post.comment_count > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">댓글 {post.comment_count.toLocaleString()}</span>
            )}
            {post.like_count > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">추천 {post.like_count.toLocaleString()}</span>
            )}
          </div>
          <p className={`text-sm font-medium line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 ${isRead ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
            {post.title}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{timeAgo(post.published_at ?? post.first_scraped_at)}</p>
        </div>
      </Link>

      {/* Action buttons — outside Link for proper tap targets */}
      <div className="flex items-center gap-3 px-4 pb-3 -mt-1">
        {onVote && (
          <VoteButton postId={post.id} voteCount={post.vote_count} hasVoted={hasVoted ?? false} onVote={onVote} />
        )}
        <BookmarkButton post={post} />
        <ShareButton url={post.url} title={post.title} thumbnail={post.thumbnail} />
      </div>
      {hasClusters && (
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
          >
            외 {clusterSize - 1}개 소스 {expanded ? '▲' : '▼'}
          </button>
        </div>
      )}
      {expanded && post.related_sources && post.related_sources.length > 0 && (
        <div className="px-4 pb-3 ml-4 space-y-1 border-l-2 border-slate-200 dark:border-slate-600 pl-3">
          {post.related_sources.map((s) => (
            <Link
              key={s.url}
              to={`/issue/${s.id}`}
              className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              <span className={`px-1.5 py-0.5 rounded ${getSourceColor(s.source_key)}`}>
                {s.source_name}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
});
