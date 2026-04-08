import React from 'react';
import { Link } from 'react-router-dom';
import { useIssueRankings } from '../hooks/useIssueRankings';
import { optimizedImage } from '../utils/imageProxy';
import type { IssueRanking } from '../types';

// ─── Category Badge Colors ───

const CATEGORY_BADGE: Record<string, string> = {
  '사회': 'text-blue-600 dark:text-blue-400',
  '경제': 'text-amber-600 dark:text-amber-400',
  '정치': 'text-red-600 dark:text-red-400',
  'IT과학': 'text-violet-600 dark:text-violet-400',
  '연예': 'text-pink-600 dark:text-pink-400',
  '스포츠': 'text-green-600 dark:text-green-400',
  '생활': 'text-teal-600 dark:text-teal-400',
  '세계': 'text-indigo-600 dark:text-indigo-400',
};

// ─── Main Component ───

export const IssueRankingList: React.FC = () => {
  const { data, isLoading, isError } = useIssueRankings();

  if (isLoading) return <IssueRankingSkeleton />;
  if (isError || !data) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">이슈 데이터를 불러올 수 없습니다</p>
        <p className="text-sm">잠시 후 다시 시도해 주세요</p>
      </div>
    );
  }

  if (data.issues.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">이슈 데이��를 준비 중입니다</p>
        <p className="text-sm">잠시만 기다려 주세요</p>
      </div>
    );
  }

  return (
    <div>
      <AggregationTimestamp calculatedAt={data.calculated_at} />
      <div className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
        {data.issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
};

// ─── Aggregation Timestamp ───

const AggregationTimestamp: React.FC<{ calculatedAt: string | null }> = ({ calculatedAt }) => {
  if (!calculatedAt) return null;

  const date = new Date(calculatedAt);
  const formatted = new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);

  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const isQuiet = kstHour >= 2 && kstHour < 6;

  return (
    <div className="flex items-center justify-end gap-2 text-xs text-slate-400 dark:text-slate-500 mb-1 px-1">
      <span>기준: {formatted} 업데이트</span>
      {isQuiet && (
        <span className="text-amber-500 dark:text-amber-400">
          야간 시간대 — 이전 데이터 표시 중
        </span>
      )}
    </div>
  );
};

// ─── Rank Change Indicator ───

const RankChangeIndicator: React.FC<{ change: number | null }> = ({ change }) => {
  if (change === null) {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400">
        NEW
      </span>
    );
  }
  if (change > 0) {
    return <span className="text-xs font-medium text-rose-500 dark:text-rose-400">▲{change}</span>;
  }
  if (change < 0) {
    return <span className="text-xs font-medium text-blue-500 dark:text-blue-400">▼{Math.abs(change)}</span>;
  }
  return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
};

// ─── Issue Card ───

const IssueCard: React.FC<{ issue: IssueRanking }> = React.memo(({ issue }) => {
  const categoryColor = CATEGORY_BADGE[issue.category_label ?? ''] ?? 'text-slate-600 dark:text-slate-400';

  return (
    <Link
      to={`/issue/${issue.id}`}
      className="block overflow-hidden hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
    >
      <div className="px-4 py-3">
        {/* Line 1: Rank (small) + Category */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`flex-shrink-0 text-xs font-bold tabular-nums ${
            issue.rank <= 3
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-400 dark:text-slate-500'
          }`}>
            {issue.rank}
          </span>
          <RankChangeIndicator change={issue.rank_change} />
          {issue.momentum_score >= 1.5 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 animate-pulse">
              급상승
            </span>
          )}
          {issue.category_label && (
            <span className={`text-xs font-medium ${categoryColor}`}>
              {issue.category_label}
            </span>
          )}
        </div>

        {/* Title — prominent, full width */}
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 leading-snug mb-2 line-clamp-2">
          {issue.title}
        </h3>

        {/* Thumbnail + Summary */}
        {(issue.thumbnail || issue.summary || issue.news_posts.length > 0) && (
          <div className={issue.thumbnail ? 'flex items-start gap-3' : ''}>
            {issue.thumbnail && (
              <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                <img
                  src={optimizedImage(issue.thumbnail, 192)}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            {issue.summary ? (
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-4">
                  {issue.summary}
                </p>
                <span className="text-xs text-blue-500 dark:text-blue-400 mt-1 inline-block">더보기 ›</span>
              </div>
            ) : issue.news_posts.length > 0 ? (
              <p className="flex-1 min-w-0 text-sm text-slate-500 dark:text-slate-400 italic truncate">
                {issue.news_posts[0].title}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </Link>
  );
});

// ─── Skeleton ───

function IssueRankingSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="px-4 py-3 animate-pulse">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="w-10 h-3 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2" />
          <div className="flex items-start gap-3 mb-2">
            <div className="w-24 h-16 sm:w-28 sm:h-20 rounded-lg bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded w-full" />
              <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded w-2/3" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-16 h-7 rounded-lg bg-slate-200 dark:bg-slate-700" />
            <div className="w-20 h-7 rounded-lg bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      ))}
    </div>
  );
}
