import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useIssueRankings } from '../hooks/useIssueRankings';
import { getSourceColor } from '../constants/sourceColors';
import { optimizedImage } from '../utils/imageProxy';
import type { IssueRanking, IssueRelatedPost, ChannelTag } from '../types';

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

const CHANNEL_TAG_STYLES: Record<ChannelTag, { default: string; active: string; label: string }> = {
  news: {
    default: 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400',
    active: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    label: '뉴스',
  },
  community: {
    default: 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400',
    active: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    label: '커뮤니티',
  },
  portal: {
    default: 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400',
    active: 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300',
    label: '트렌드',
  },
  sns: {
    default: 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400',
    active: 'border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    label: 'SNS',
  },
};

// ─── Category Fallback Icons ───

const CATEGORY_ICONS: Record<string, string> = {
  '사회': '📰', '경제': '📈', '정치': '🏛️', 'IT과학': '💻',
  '연예': '⭐', '스포츠': '⚽', '생활': '🏠', '세계': '🌍',
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
  const [activeChannel, setActiveChannel] = useState<ChannelTag | null>(null);

  const toggleChannel = useCallback((tag: ChannelTag) => {
    setActiveChannel(prev => prev === tag ? null : tag);
  }, []);

  const categoryColor = CATEGORY_BADGE[issue.category_label ?? ''] ?? 'text-slate-600 dark:text-slate-400';
  const fallbackIcon = CATEGORY_ICONS[issue.category_label ?? ''] ?? '📰';

  return (
    <div className="overflow-hidden">
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
          <div className={`mb-2 ${issue.thumbnail ? 'flex items-start gap-3' : ''}`}>
            {issue.thumbnail && (
              <div className="flex-shrink-0 w-24 h-16 sm:w-28 sm:h-20 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                <img
                  src={optimizedImage(issue.thumbnail, 224)}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            {issue.summary ? (
              <p className="flex-1 min-w-0 text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                {issue.summary}
              </p>
            ) : issue.news_posts.length > 0 ? (
              <p className="flex-1 min-w-0 text-sm text-slate-500 dark:text-slate-400 italic truncate">
                {issue.news_posts[0].title}
              </p>
            ) : null}
          </div>
        )}

        {/* Channel Tags — prominent row */}
        <div className="flex items-center gap-2 mt-2 overflow-x-auto scrollbar-hide">
          {issue.channel_tags.map(tag => {
            const style = CHANNEL_TAG_STYLES[tag];
            const isActive = activeChannel === tag;
            const count = tag === 'news'
              ? issue.news_post_count + issue.video_post_count
              : tag === 'community'
                ? issue.community_post_count
                : tag === 'portal'
                  ? issue.matched_keywords.length
                  : issue.sns_keywords.length;

            return (
              <button
                key={tag}
                onClick={() => toggleChannel(tag)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  isActive ? style.active : style.default
                }`}
              >
                {style.label}{count > 0 ? ` ${count}` : ''}
              </button>
            );
          })}
          <Link
            to={`/issue/${issue.id}`}
            className="flex-shrink-0 ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            자세히 보기 →
          </Link>
        </div>
      </div>

      {/* Expanded Channel Content */}
      {activeChannel !== null && (
        <div className="border-t border-slate-100 dark:border-slate-700/50 px-4 py-2 space-y-1">
          {activeChannel === 'news' && (
            <>
              {issue.news_posts.length > 0 && <PostGroup label="뉴스" posts={issue.news_posts} />}
              {issue.video_posts.length > 0 && <PostGroup label="영상" posts={issue.video_posts} />}
            </>
          )}
          {activeChannel === 'community' && issue.community_posts.length > 0 && (
            <PostGroup label="커뮤니티" posts={issue.community_posts} />
          )}
          {activeChannel === 'portal' && issue.matched_keywords.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1 mt-1">포털 트렌드</p>
              <div className="flex flex-wrap gap-1">
                {issue.matched_keywords.map((kw) => (
                  <span key={kw} className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
          {activeChannel === 'sns' && issue.sns_keywords.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1 mt-1">SNS 트렌드</p>
              <div className="flex flex-wrap gap-1">
                {issue.sns_keywords.map((kw) => (
                  <span key={kw} className="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

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
