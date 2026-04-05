import React from 'react';
import { Link } from 'react-router-dom';
import { useTrending } from '../hooks/usePosts';
import { getSourceColor } from '../constants/sourceColors';

export const TrendingSection: React.FC = () => {
  const { data, isLoading } = useTrending();

  if (isLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-base font-bold text-slate-500 dark:text-slate-400 mb-3">🔥 지금 뜨는 글</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex-shrink-0 w-64 h-24 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const posts = data?.posts ?? [];
  if (posts.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-slate-500 dark:text-slate-400 mb-3">🔥 지금 뜨는 글</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {posts.slice(0, 10).map((post, i) => (
          <Link
            key={post.id}
            to={`/issue/${post.id}`}
            className="flex-shrink-0 w-64 px-4 py-3 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors group"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold text-orange-500">#{i + 1}</span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${getSourceColor(post.source_key, post.category)}`}>{post.source_name}</span>
              {post.view_count > 0 && (
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">조회 {post.view_count.toLocaleString()}</span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2 group-hover:text-orange-600 dark:group-hover:text-orange-400">
              {post.title}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
};
