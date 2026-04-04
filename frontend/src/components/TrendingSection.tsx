import React from 'react';
import { Link } from 'react-router-dom';
import { useTrending } from '../hooks/usePosts';
import { getSourceColor } from '../constants/sourceColors';

export const TrendingSection: React.FC = () => {
  const { data, isLoading } = useTrending();

  if (isLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 mb-3">🔥 지금 뜨는 글</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex-shrink-0 w-64 h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const posts = data?.posts ?? [];
  if (posts.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-slate-500 mb-3">🔥 지금 뜨는 글</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {posts.slice(0, 10).map((post, i) => (
          <Link
            key={post.id}
            to={`/issue/${post.id}`}
            className="flex-shrink-0 w-64 p-3 bg-white rounded-xl border border-slate-200 hover:border-orange-300 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold text-orange-500">#{i + 1}</span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${getSourceColor(post.source_key, post.category)}`}>{post.source_name}</span>
              {post.view_count > 0 && (
                <span className="text-xs text-slate-400 ml-auto">조회 {post.view_count.toLocaleString()}</span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-800 line-clamp-2 group-hover:text-orange-600">
              {post.title}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
};
