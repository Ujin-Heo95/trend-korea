import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMiniEditorial } from '../api/client';

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export const MiniBriefing: React.FC = () => {
  const { data } = useQuery({
    queryKey: ['mini-editorial'],
    queryFn: fetchMiniEditorial,
    refetchInterval: 5 * 60_000,
    staleTime: 3 * 60_000,
  });

  if (!data) return null;

  return (
    <div className="mb-6 rounded-xl bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-100 dark:border-indigo-800/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">AI 이슈 브리핑</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(data.created_at)} 업데이트</span>
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-2">
        {data.briefing}
      </p>
      {data.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.keywords.map(kw => (
            <span
              key={kw}
              className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
            >
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
