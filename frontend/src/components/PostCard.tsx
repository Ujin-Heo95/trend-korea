import React, { useState } from 'react';
import type { Post } from '../types';
import { SOURCE_COLORS } from '../constants/sourceColors';

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export const PostCard: React.FC<{ post: Post; rank?: number }> = ({ post, rank }) => {
  const [expanded, setExpanded] = useState(false);
  const clusterSize = post.cluster_size ?? 1;
  const hasClusters = clusterSize > 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all">
      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
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
          <p className="text-sm font-medium text-slate-800 line-clamp-2 group-hover:text-blue-600">
            {post.title}
          </p>
          <p className="text-xs text-slate-400 mt-1">{timeAgo(post.scraped_at)}</p>
        </div>
      </a>
      {expanded && post.related_sources && post.related_sources.length > 0 && (
        <div className="px-4 pb-3 ml-4 space-y-1 border-l-2 border-slate-200 pl-3">
          {post.related_sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-500 transition-colors"
            >
              <span className={`px-1.5 py-0.5 rounded ${SOURCE_COLORS[s.source_key] ?? 'bg-slate-100 text-slate-600'}`}>
                {s.source_name}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
