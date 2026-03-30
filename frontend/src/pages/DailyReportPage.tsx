import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchDailyReport } from '../api/client';
import type { DailyReportSection, Category } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  news: { emoji: '\ud83d\udcf0', label: '\ub274\uc2a4' },
  tech: { emoji: '\ud83d\udcbb', label: '\ud14c\ud06c' },
  community: { emoji: '\ud83d\udcac', label: '\ucee4\ubba4\ub2c8\ud2f0' },
  finance: { emoji: '\ud83d\udcb0', label: '\uae08\uc735' },
  trend: { emoji: '\ud83d\udcc8', label: '\ud2b8\ub80c\ub4dc' },
  video: { emoji: '\ud83c\udfac', label: '\uc601\uc0c1' },
  government: { emoji: '\ud83c\udfdb\ufe0f', label: '\uc815\ubd80' },
  deals: { emoji: '\ud83d\uded2', label: '\ud56b\ub51c' },
  newsletter: { emoji: '\ud83d\udce7', label: '\ub274\uc2a4\ub808\ud130' },
  alert: { emoji: '\ud83d\udea8', label: '\uc18d\ubcf4' },
  sports: { emoji: '\u26bd', label: '\uc2a4\ud3ec\uce20' },
  press: { emoji: '\ud83d\udce2', label: '\ubcf4\ub3c4\uc790\ub8cc' },
  techblog: { emoji: '\ud83e\uddd1\u200d\ud83d\udcbb', label: '\ud14c\ud06c\ube14\ub85c\uadf8' },
  movie: { emoji: '\ud83c\udfa5', label: '\uc601\ud654' },
  performance: { emoji: '\ud83c\udfad', label: '\uacf5\uc5f0/\uc804\uc2dc' },
};

const CATEGORY_ORDER: Category[] = [
  'news', 'tech', 'community', 'finance', 'trend',
  'video', 'sports', 'movie', 'performance', 'government', 'deals',
  'newsletter', 'press', 'techblog', 'alert',
];

function formatNumber(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}\ub9cc`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}\ucc9c`;
  return String(n);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const weekdays = ['\uc77c', '\uc6d4', '\ud654', '\uc218', '\ubaa9', '\uae08', '\ud1a0'];
  return `${d.getFullYear()}\ub144 ${d.getMonth() + 1}\uc6d4 ${d.getDate()}\uc77c (${weekdays[d.getDay()]})`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function groupSections(sections: DailyReportSection[]): Map<string, DailyReportSection[]> {
  const map = new Map<string, DailyReportSection[]>();
  for (const s of sections) {
    const arr = map.get(s.category);
    if (arr) arr.push(s);
    else map.set(s.category, [s]);
  }
  return map;
}

function CategoryBlock({ category, sections }: { category: string; sections: DailyReportSection[] }) {
  const meta = CATEGORY_META[category] ?? { emoji: '\ud83d\udccc', label: category };
  const catSummary = sections.find(s => s.category_summary)?.category_summary;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-slate-800 mb-2">
        {meta.emoji} {meta.label}
      </h2>
      {catSummary && (
        <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-2 mb-3 leading-relaxed">
          {catSummary}
        </p>
      )}
      <div className="space-y-2">
        {sections.map(s => (
          <ReportPostRow key={`${s.category}-${s.rank}`} section={s} />
        ))}
      </div>
    </section>
  );
}

function ReportPostRow({ section }: { section: DailyReportSection }) {
  const { rank, title, url, source_name, view_count, comment_count, cluster_size, summary } = section;

  return (
    <div className="flex items-start gap-3 py-2">
      <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-slate-800 hover:text-blue-600 transition-colors line-clamp-2"
            >
              {title ?? '(deleted)'}
            </a>
          ) : (
            <span className="text-sm font-medium text-slate-400">{title ?? '(deleted)'}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
          {source_name && <span>{source_name}</span>}
          {(view_count ?? 0) > 0 && <span>조회 {formatNumber(view_count!)}</span>}
          {(comment_count ?? 0) > 0 && <span>댓글 {formatNumber(comment_count!)}</span>}
          {(cluster_size ?? 1) > 1 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
              {cluster_size}개 소스
            </span>
          )}
        </div>
        {summary && (
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{summary}</p>
        )}
      </div>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {[1, 2, 3].map(i => (
        <div key={i}>
          <div className="h-6 bg-slate-200 rounded w-32 mb-3" />
          <div className="space-y-3">
            {[1, 2, 3].map(j => (
              <div key={j} className="flex gap-3">
                <div className="w-7 h-7 bg-slate-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DailyReportPage() {
  const { date } = useParams<{ date: string }>();
  useDocumentTitle(date ? `일일 리포트 ${date}` : '일일 리포트');

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['daily-report', date],
    queryFn: () => fetchDailyReport(date!),
    staleTime: 5 * 60_000,
    enabled: !!date,
  });

  if (!date) {
    return (
      <div className="text-center py-20 text-slate-500">
        잘못된 접근입니다. <Link to="/" className="text-blue-600 hover:underline">홈으로</Link>
      </div>
    );
  }

  const prevDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link to="/" className="text-sm text-slate-400 hover:text-blue-600 mb-2 inline-block">
          &larr; 홈으로
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">일일 리포트</h1>
        <p className="text-sm text-slate-500 mt-1">{formatDate(date)}</p>
      </div>

      {/* Content */}
      {isLoading && <ReportSkeleton />}

      {error && (
        <div className="text-center py-16">
          <p className="text-slate-500 mb-2">
            {(error as any)?.response?.status === 404
              ? '해당 날짜의 리포트가 아직 생성되지 않았습니다.'
              : '리포트를 불러오는데 실패했습니다.'}
          </p>
          <Link to="/" className="text-blue-600 hover:underline text-sm">홈으로 돌아가기</Link>
        </div>
      )}

      {report && (() => {
        const grouped = groupSections(report.sections);
        const hasContent = grouped.size > 0;

        return hasContent ? (
          <>
            <p className="text-sm text-slate-400 mb-6">
              {report.sections.length}개 포스트 큐레이션 | 조회 {formatNumber(report.view_count)}
            </p>

            {/* Editorial Section */}
            {report.editorial_briefing && (
              <div className="mb-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5">
                {report.editorial_keywords && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {report.editorial_keywords.split(',').map((kw: string) => (
                      <span key={kw.trim()} className="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                        #{kw.trim()}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-sm text-slate-700 leading-relaxed mb-3">
                  {report.editorial_briefing}
                </p>
                {report.editorial_watch_point && (
                  <p className="text-xs text-indigo-600 border-t border-blue-100 pt-3">
                    <span className="font-semibold">주목 포인트</span> {report.editorial_watch_point}
                  </p>
                )}
              </div>
            )}

            {CATEGORY_ORDER.map(cat => {
              const sections = grouped.get(cat);
              if (!sections || sections.length === 0) return null;
              return <CategoryBlock key={cat} category={cat} sections={sections} />;
            })}
          </>
        ) : (
          <p className="text-center py-16 text-slate-500">
            해당 날짜에 수집된 데이터가 없습니다.
          </p>
        );
      })()}

      {/* Navigation */}
      <nav className="flex items-center justify-between py-6 border-t border-slate-200 mt-8">
        <Link
          to={`/daily-report/${prevDate}`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; {prevDate}
        </Link>
        <Link to="/" className="text-sm text-slate-400 hover:text-blue-600">
          홈
        </Link>
        <Link
          to={`/daily-report/${nextDate}`}
          className="text-sm text-blue-600 hover:underline"
        >
          {nextDate} &rarr;
        </Link>
      </nav>
    </div>
  );
}
