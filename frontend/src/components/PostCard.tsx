import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Post } from '../types';
import { SOURCE_COLORS } from '../constants/sourceColors';
import { ShareButton } from './shared/ShareButton';
import { VoteButton } from './shared/VoteButton';

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

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

export const PostCard: React.FC<PostCardProps> = ({ post, rank, isRead, onRead, hasVoted, onVote, style }) => {
  const [expanded, setExpanded] = useState(false);
  const clusterSize = post.cluster_size ?? 1;
  const hasClusters = clusterSize > 1;

  const rankStyle = rank != null && rank <= 3
    ? RANK_STYLES[rank]
    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400';

  return (
    <div
      className={`rounded-xl border shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-500 transition-all animate-card-enter ${
        isRead
          ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700 opacity-60'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
      }`}
      style={style}
    >
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
            <img src={post.thumbnail} alt="" loading="lazy" decoding="async" width={64} height={48} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SOURCE_COLORS[post.source_key] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
              {post.source_name}
            </span>
            {post.view_count > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">조회 {post.view_count.toLocaleString()}</span>
            )}
            {post.comment_count > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">댓글 {post.comment_count.toLocaleString()}</span>
            )}
            {post.keywords?.slice(0, 2).map(kw => (
              <span key={kw} className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                {kw}
              </span>
            ))}
            {hasClusters && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }}
                className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
              >
                외 {clusterSize - 1}개 소스 {expanded ? '▲' : '▼'}
              </button>
            )}
          </div>
          <p className={`text-sm font-medium line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 ${isRead ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
            {post.title}
          </p>
          {post.ai_summary && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{post.ai_summary}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(post.published_at ?? post.scraped_at)}</p>
            {onVote && (
              <VoteButton postId={post.id} voteCount={post.vote_count} hasVoted={hasVoted ?? false} onVote={onVote} />
            )}
            <ShareButton url={post.url} title={post.title} thumbnail={post.thumbnail} />
          </div>
        </div>
      </Link>
      {expanded && post.related_sources && post.related_sources.length > 0 && (
        <div className="px-4 pb-3 ml-4 space-y-1 border-l-2 border-slate-200 dark:border-slate-600 pl-3">
          {post.related_sources.map((s) => (
            <Link
              key={s.url}
              to={`/issue/${s.id}`}
              className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              <span className={`px-1.5 py-0.5 rounded ${SOURCE_COLORS[s.source_key] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                {s.source_name}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
