import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTrendSignals } from '../hooks/usePosts';
import type { BigKindsIssue, BigKindsRelatedPost } from '../types';
import { ErrorRetry } from './shared/ErrorRetry';

// ── 관련 게시글 행 ──────────────────────────────────────

const RelatedPostRow: React.FC<{ post: BigKindsRelatedPost }> = ({ post }) => (
  <Link
    to={`/issue/${post.id}`}
    className="flex items-start gap-2 py-1.5 px-1 rounded hover:bg-indigo-50 transition-colors group/rel"
  >
    <span className="text-xs text-indigo-300 mt-0.5 shrink-0">💬</span>
    <span className="text-xs text-slate-700 group-hover/rel:text-indigo-600 line-clamp-1 flex-1">
      {post.title}
    </span>
    <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
      {post.source_name}
    </span>
  </Link>
);

// ── 이슈 카드 ───────────────────────────────────────────

const IssueCard: React.FC<{
  issue: BigKindsIssue;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ issue, isExpanded, onToggle }) => {
  const isTop3 = issue.rank <= 3;
  const hasRelated = issue.relatedPosts.length > 0;

  const borderClass = isTop3
    ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50'
    : 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-slate-50';

  const hoverBorderClass = isTop3
    ? 'hover:border-amber-400 hover:shadow-amber-100'
    : 'hover:border-indigo-300 hover:shadow-indigo-100';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={hasRelated ? onToggle : undefined}
      onKeyDown={hasRelated ? (e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); } : undefined}
      className={`flex-shrink-0 w-56 p-3 rounded-xl border-2 ${borderClass} ${hoverBorderClass} hover:shadow-md transition-all ${hasRelated ? 'cursor-pointer' : ''} ${isExpanded ? 'w-72' : ''}`}
    >
      {/* 상단: 순위 + 기사 건수 */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-bold ${isTop3 ? 'text-amber-600' : 'text-indigo-500'}`}>
            #{issue.rank}
          </span>
          {issue.period && (
            <span className="text-[10px] text-slate-400">
              {issue.period}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">
          📰 {issue.articleCount}건
        </span>
      </div>

      {/* 키워드 (이슈 제목) */}
      <p className={`text-sm font-semibold mb-1.5 line-clamp-2 ${isTop3 ? 'text-amber-900' : 'text-slate-800'}`}>
        {issue.keyword}
      </p>

      {/* 하단: BigKinds 링크 + 관련글 토글 */}
      <div className="flex items-center justify-between">
        <a
          href={issue.bigkindsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-indigo-500 hover:text-indigo-700 underline underline-offset-2"
        >
          뉴스 검색 →
        </a>
        {hasRelated && (
          <span className="text-[10px] text-slate-400">
            {isExpanded ? '▲' : `💬 ${issue.relatedPosts.length}건`}
          </span>
        )}
      </div>

      {/* 펼친 상태: 관련 커뮤니티 게시글 */}
      {isExpanded && issue.relatedPosts.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-200/60 space-y-0">
          {issue.relatedPosts.map(post => (
            <RelatedPostRow key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── 메인 컴포넌트 ───────────────────────────────────────

export const TrendRadar: React.FC = () => {
  const { data, isLoading, error, refetch } = useTrendSignals();
  const [expandedRank, setExpandedRank] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 mb-3">📰 오늘의 뉴스 이슈</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex-shrink-0 w-56 h-28 bg-white rounded-xl border-2 border-slate-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 mb-3">📰 오늘의 뉴스 이슈</h2>
        <ErrorRetry message="뉴스 이슈를 불러오지 못했습니다." onRetry={refetch} />
      </div>
    );
  }

  const issues = data?.issues ?? [];
  if (issues.length === 0) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 mb-3">📰 오늘의 뉴스 이슈</h2>
        <div className="border-2 border-dashed border-slate-200 rounded-xl py-8 text-center">
          <p className="text-sm text-slate-400">뉴스 이슈를 수집 중입니다</p>
          <p className="text-xs text-slate-300 mt-1">잠시 후 자동으로 표시됩니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-500">📰 오늘의 뉴스 이슈</h2>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
          Top {issues.length}
        </span>
        <span className="text-[10px] text-slate-300 ml-auto">빅카인즈 제공</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {issues.map(issue => (
          <IssueCard
            key={issue.rank}
            issue={issue}
            isExpanded={expandedRank === issue.rank}
            onToggle={() => setExpandedRank(prev => prev === issue.rank ? null : issue.rank)}
          />
        ))}
      </div>
    </div>
  );
};
