import React from 'react';

export const PostCardSkeleton: React.FC = () => (
  <div className="border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
    <div className="flex items-start gap-3">
      {/* rank badge */}
      <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 animate-shimmer flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        {/* source badge + meta row */}
        <div className="flex items-center gap-2">
          <div className="w-14 h-5 rounded-full bg-slate-200 dark:bg-slate-700 animate-shimmer" />
          <div className="w-12 h-4 rounded bg-slate-100 dark:bg-slate-700 animate-shimmer" />
        </div>
        {/* title line 1 */}
        <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-700 animate-shimmer" />
        {/* title line 2 */}
        <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700 animate-shimmer" />
        {/* timestamp + actions row */}
        <div className="flex items-center gap-3 pt-1">
          <div className="w-12 h-3 rounded bg-slate-100 dark:bg-slate-700 animate-shimmer" />
          <div className="w-8 h-3 rounded bg-slate-100 dark:bg-slate-700 animate-shimmer" />
        </div>
      </div>
    </div>
  </div>
);
