import React from 'react';

export const IssueDetailSkeleton: React.FC = () => (
  <div className="max-w-3xl mx-auto px-4 py-6 pb-24 animate-shimmer">
    {/* Back button */}
    <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700 mb-4" />

    {/* Meta badges row */}
    <div className="flex items-center gap-2 mb-3">
      <div className="w-16 h-5 rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="w-20 h-5 rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="w-14 h-4 rounded bg-slate-100 dark:bg-slate-700" />
    </div>

    {/* Title */}
    <div className="h-6 w-full rounded bg-slate-200 dark:bg-slate-700 mb-2" />
    <div className="h-6 w-2/3 rounded bg-slate-200 dark:bg-slate-700 mb-3" />

    {/* AI summary */}
    <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-700 mb-1" />
    <div className="h-4 w-4/5 rounded bg-slate-100 dark:bg-slate-700 mb-4" />

    {/* Thumbnail placeholder */}
    <div className="w-full h-48 rounded-xl bg-slate-200 dark:bg-slate-700 mb-4" />

    {/* Stats row */}
    <div className="flex items-center gap-4 mb-6">
      <div className="w-16 h-4 rounded bg-slate-100 dark:bg-slate-700" />
      <div className="w-20 h-4 rounded bg-slate-100 dark:bg-slate-700" />
      <div className="w-16 h-4 rounded bg-slate-100 dark:bg-slate-700" />
    </div>

    {/* Related articles section */}
    <div className="mb-6">
      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 mb-3" />
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div className="w-12 h-9 rounded bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="w-14 h-4 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Action button placeholder */}
    <div className="h-12 w-full rounded-xl bg-slate-200 dark:bg-slate-700 mt-8" />
  </div>
);
