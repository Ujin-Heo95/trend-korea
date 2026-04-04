import React from 'react';

export const ReportSkeleton: React.FC = () => (
  <div className="animate-shimmer space-y-8">
    {/* Date header */}
    <div className="space-y-2">
      <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-7 w-40 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-48 rounded bg-slate-100 dark:bg-slate-700" />
    </div>

    {/* Editorial block */}
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
      <div className="flex gap-2">
        <div className="w-16 h-6 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="w-16 h-6 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="w-20 h-6 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-5/6 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-3/4 rounded bg-slate-100 dark:bg-slate-700" />
    </div>

    {/* 5 section blocks */}
    {[1, 2, 3, 4, 5].map(section => (
      <div key={section}>
        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map(row => (
            <div key={row} className="flex gap-3">
              <div className="w-7 h-7 bg-slate-200 dark:bg-slate-700 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);
