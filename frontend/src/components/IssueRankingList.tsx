import React, { useState } from 'react';
import { useIssueRankings } from '../hooks/useIssueRankings';
import { getSourceColor } from '../constants/sourceColors';
import type { IssueRanking, IssueRelatedPost } from '../types';

// ─── Category Badge Colors ───

const CATEGORY_BADGE: Record<string, string> = {
  '사회': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  '경제': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  '정치': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'IT과학': 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  '연예': 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  '스포츠': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  '생활': 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  '세계': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
};

const DEFAULT_BADGE = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';

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
        <p className="text-lg mb-1">이슈 데이터를 준비 중입니다</p>
        <p className="text-sm">잠시만 기다려 주세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
    </div>
  );
};

// ─── Issue Card ───

const IssueCard: React.FC<{ issue: IssueRanking }> = ({ issue }) => {
  const [expanded, setExpanded] = useState(false);
  const totalPosts = issue.news_post_count + issue.community_post_count;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Rank */}
          <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
            issue.rank <= 3
              ? 'bg-blue-600 text-white dark:bg-blue-500'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
          }`}>
            {issue.rank}
          </span>

          <div className="flex-1 min-w-0">
            {/* Category + Title */}
            <div className="flex items-center gap-2 mb-1.5">
              {issue.category_label && (
                <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                  CATEGORY_BADGE[issue.category_label] ?? DEFAULT_BADGE
                }`}>
                  {issue.category_label}
                </span>
              )}
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 line-clamp-2 leading-snug">
                {issue.title}
              </h3>
            </div>

            {/* Summary */}
            {issue.summary && (
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2 line-clamp-3">
                {issue.summary}
              </p>
            )}

            {/* Expand toggle */}
            {totalPosts > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>
                  {issue.news_post_count > 0 && `뉴스 ${issue.news_post_count}건`}
                  {issue.news_post_count > 0 && issue.community_post_count > 0 && ' · '}
                  {issue.community_post_count > 0 && `커뮤니티 ${issue.community_post_count}건`}
                </span>
              </button>
            )}
          </div>

          {/* Thumbnail */}
          {issue.thumbnail && (
            <img
              src={issue.thumbnail}
              alt=""
              className="flex-shrink-0 w-16 h-16 rounded-lg object-cover"
              loading="lazy"
            />
          )}
        </div>
      </div>

      {/* Expanded: Related Posts */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-700/50 px-4 py-2 space-y-1">
          {issue.news_posts.length > 0 && (
            <PostGroup label="뉴스" posts={issue.news_posts} />
          )}
          {issue.community_posts.length > 0 && (
            <PostGroup label="커뮤니티" posts={issue.community_posts} />
          )}
        </div>
      )}
    </div>
  );
};

// ─── Post Group ───

const PostGroup: React.FC<{ label: string; posts: IssueRelatedPost[] }> = ({ label, posts }) => (
  <div>
    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1 mt-1">{label}</p>
    {posts.map((post) => (
      <a
        key={post.id}
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/30 rounded px-1 -mx-1 transition-colors"
      >
        <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${getSourceColor(post.source_key, null)}`}>
          {post.source_name}
        </span>
        <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">
          {post.title}
        </span>
        {post.view_count > 0 && (
          <span className="flex-shrink-0 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            {post.view_count.toLocaleString()}
          </span>
        )}
      </a>
    ))}
  </div>
);

// ─── Skeleton ───

function IssueRankingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <div className="w-12 h-5 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
              </div>
              <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded w-full" />
              <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded w-2/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
