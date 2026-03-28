import React from 'react';
import type { Post } from '../types';

const COLORS: Record<string, string> = {
  dcinside: 'bg-blue-100 text-blue-700',
  fmkorea: 'bg-green-100 text-green-700',
  ruliweb: 'bg-orange-100 text-orange-700',
  theqoo: 'bg-pink-100 text-pink-700',
  instiz: 'bg-purple-100 text-purple-700',
  natepann: 'bg-yellow-100 text-yellow-700',
  clien: 'bg-teal-100 text-teal-700',
  ppomppu: 'bg-red-100 text-red-700',
  todayhumor: 'bg-lime-100 text-lime-700',
  youtube: 'bg-red-100 text-red-600',
  yna: 'bg-slate-100 text-slate-600',
  chosun: 'bg-slate-100 text-slate-600',
  hani: 'bg-slate-100 text-slate-600',
  joins: 'bg-slate-100 text-slate-600',
};

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export const PostCard: React.FC<{ post: Post }> = ({ post }) => (
  <a
    href={post.url}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-start gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all group"
  >
    {post.thumbnail && (
      <img src={post.thumbnail} alt="" className="w-16 h-12 object-cover rounded-lg flex-shrink-0" />
    )}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${COLORS[post.source_key] ?? 'bg-slate-100 text-slate-600'}`}>
          {post.source_name}
        </span>
        {post.view_count > 0 && (
          <span className="text-xs text-slate-400">조회 {post.view_count.toLocaleString()}</span>
        )}
      </div>
      <p className="text-sm font-medium text-slate-800 line-clamp-2 group-hover:text-blue-600">
        {post.title}
      </p>
      <p className="text-xs text-slate-400 mt-1">{timeAgo(post.scraped_at)}</p>
    </div>
  </a>
);
