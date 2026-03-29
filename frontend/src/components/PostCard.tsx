import React, { useState } from 'react';
import type { Post } from '../types';

const COLORS: Record<string, string> = {
  dcinside: 'bg-blue-100 text-blue-700',
  bobaedream: 'bg-green-100 text-green-700',
  ruliweb: 'bg-orange-100 text-orange-700',
  theqoo: 'bg-pink-100 text-pink-700',
  instiz: 'bg-purple-100 text-purple-700',
  natepann: 'bg-yellow-100 text-yellow-700',
  todayhumor: 'bg-lime-100 text-lime-700',
  ppomppu: 'bg-red-100 text-red-700',
  ppomppu_hot: 'bg-red-100 text-red-700',
  youtube: 'bg-red-100 text-red-600',
  yna: 'bg-slate-100 text-slate-600',
  hani: 'bg-emerald-100 text-emerald-700',
  sbs: 'bg-blue-100 text-blue-600',
  donga: 'bg-slate-100 text-slate-600',
  khan: 'bg-sky-100 text-sky-700',
  hankyung: 'bg-amber-100 text-amber-700',
  mk: 'bg-indigo-100 text-indigo-700',
  seoul: 'bg-slate-100 text-slate-600',
  kmib: 'bg-slate-100 text-slate-600',
  geeknews: 'bg-violet-100 text-violet-700',
  yozm: 'bg-cyan-100 text-cyan-700',
  kma: 'bg-yellow-100 text-yellow-700',
  krx: 'bg-emerald-100 text-emerald-700',
  google_trends: 'bg-blue-100 text-blue-600',
  naver_datalab: 'bg-green-100 text-green-600',
  korea_press: 'bg-teal-100 text-teal-700',
  korea_policy: 'bg-teal-100 text-teal-700',
  korea_briefing: 'bg-teal-100 text-teal-700',
  uppity: 'bg-pink-100 text-pink-700',
  google_news_kr: 'bg-blue-100 text-blue-600',
  koreaherald: 'bg-rose-100 text-rose-700',
  koreatimes: 'bg-sky-100 text-sky-700',
  newsis: 'bg-amber-100 text-amber-700',
};

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export const PostCard: React.FC<{ post: Post }> = ({ post }) => {
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
        {post.thumbnail && (
          <img src={post.thumbnail} alt="" loading="lazy" width={64} height={48} className="w-16 h-12 object-cover rounded-lg flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${COLORS[post.source_key] ?? 'bg-slate-100 text-slate-600'}`}>
              {post.source_name}
            </span>
            {post.view_count > 0 && (
              <span className="text-xs text-slate-400">조회 {post.view_count.toLocaleString()}</span>
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
              <span className={`px-1.5 py-0.5 rounded ${COLORS[s.source_key] ?? 'bg-slate-100 text-slate-600'}`}>
                {s.source_name}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
