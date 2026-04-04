import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchWeeklyDigestLatest } from '../api/client';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ErrorRetry } from '../components/shared/ErrorRetry';

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}

export const WeeklyDigestPage: React.FC = () => {
  useDocumentTitle('주간 다이제스트');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['weekly-digest'],
    queryFn: fetchWeeklyDigestLatest,
    staleTime: 10 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-64" />
          <div className="h-40 bg-slate-100 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <ErrorRetry message="주간 다이제스트를 불러올 수 없습니다" onRetry={refetch} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center text-slate-400 dark:text-slate-500">
        <p className="text-lg">아직 주간 다이제스트가 생성되지 않았습니다.</p>
        <p className="text-sm mt-2">매주 월요일 오전에 자동 생성됩니다.</p>
        <Link to="/" className="text-blue-500 hover:underline mt-4 inline-block">홈으로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <Link to="/" className="text-sm text-slate-500 dark:text-slate-400 hover:text-blue-500 mb-2 inline-block">
        &larr; 홈
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
        주간 다이제스트
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        {formatWeekRange(data.week_start)}
      </p>

      {/* 핵심 키워드 */}
      <div className="flex flex-wrap gap-2 mb-6">
        {data.top_keywords.map(kw => (
          <Link
            key={kw}
            to={`/keyword/${encodeURIComponent(kw)}`}
            className="text-sm px-3 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors font-medium"
          >
            {kw}
          </Link>
        ))}
      </div>

      {/* 다이제스트 본문 */}
      <div className="p-5 rounded-xl bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-800 dark:to-blue-900/20 border border-slate-200 dark:border-slate-700 mb-6">
        <div className="flex items-center gap-1.5 mb-3">
          <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0l2 5h5l-4 3.5 1.5 5L8 10.5 3.5 13.5 5 8.5 1 5h5z"/></svg>
          <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">AI 주간 분석</span>
        </div>
        <p className="text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">{data.digest}</p>
      </div>

      {/* 다음 주 전망 */}
      {data.outlook && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">
            다음 주 전망
          </h3>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{data.outlook}</p>
        </div>
      )}
    </div>
  );
};

export default WeeklyDigestPage;
