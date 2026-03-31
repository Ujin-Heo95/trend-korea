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

interface PostCardProps {
  post: Post;
  rank?: number;
  isRead?: boolean;
  onRead?: (url: string) => void;
  hasVoted?: boolean;
  onVote?: (postId: number, onCountUpdate?: (count: number) => void) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, rank, isRead, onRead, hasVoted, onVote }) => {
  const [expanded, setExpanded] = useState(false);
  const clusterSize = post.cluster_size ?? 1;
  const hasClusters = clusterSize > 1;

  return (
    <div className={`rounded-xl border hover:border-blue-300 hover:shadow-sm transition-all ${isRead ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'}`}>
      <Link
        to={`/issue/${post.id}`}
        onClick={() => onRead?.(post.url)}
        className="flex items-start gap-3 p-4 group"
      >
        {rank != null && (
          <span className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${
            rank <= 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
          }`}>
            {rank}
          </span>
        )}
        {post.thumbnail && (
          <img src={post.thumbnail} alt="" loading="lazy" width={64} height={48} className="w-16 h-12 object-cover rounded-lg flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SOURCE_COLORS[post.source_key] ?? 'bg-slate-100 text-slate-600'}`}>
              {post.source_name}
            </span>
            {post.view_count > 0 && (
              <span className="text-xs text-slate-400">조회 {post.view_count.toLocaleString()}</span>
            )}
            {post.comment_count > 0 && (
              <span className="text-xs text-slate-400">댓글 {post.comment_count.toLocaleString()}</span>
            )}
            {Array.isArray(post.metadata?.searchKeywords) && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {String(post.metadata!.searchKeywords[0])} 관련
              </span>
            )}
            {hasClusters && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }}
                className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
              >
                외 {clusterSize - 1}개 소스 {expanded ? '▲' : '▼'}
              </button>
            )}
          </div>
          <p className={`text-sm font-medium line-clamp-2 group-hover:text-blue-600 ${isRead ? 'text-slate-400' : 'text-slate-800'}`}>
            {post.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-slate-400">{timeAgo(post.published_at ?? post.scraped_at)}</p>
            {onVote && (
              <VoteButton postId={post.id} voteCount={post.vote_count} hasVoted={hasVoted ?? false} onVote={onVote} />
            )}
            <ShareButton url={post.url} title={post.title} thumbnail={post.thumbnail} />
          </div>
        </div>
      </Link>
      {expanded && post.related_sources && post.related_sources.length > 0 && (
        <div className="px-4 pb-3 ml-4 space-y-1 border-l-2 border-slate-200 pl-3">
          {post.related_sources.map((s) => (
            <Link
              key={s.url}
              to={`/issue/${s.id}`}
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-500 transition-colors"
            >
              <span className={`px-1.5 py-0.5 rounded ${SOURCE_COLORS[s.source_key] ?? 'bg-slate-100 text-slate-600'}`}>
                {s.source_name}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
