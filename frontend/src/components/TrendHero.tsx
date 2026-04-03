import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTopics } from '../hooks/usePosts';
import type { Topic } from '../types';
import { ErrorRetry } from './shared/ErrorRetry';

// ── 위치변동 인디케이터 (다음 포커스 스타일) ───────────────

const ChangeIndicator: React.FC<{ topic: Topic }> = ({ topic }) => {
  if (topic.changeType === 'new') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white">NEW</span>;
  }
  if (topic.changeType === 'up') {
    return (
      <span className="text-[10px] font-bold text-emerald-600">
        ▲{topic.changeAmount}
      </span>
    );
  }
  if (topic.changeType === 'down') {
    return (
      <span className="text-[10px] font-bold text-red-400">
        ▼{topic.changeAmount}
      </span>
    );
  }
  return <span className="text-[10px] text-slate-400">—</span>;
};

// ── 신뢰도 뱃지 ──────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  high:   { label: '확인됨', color: 'text-amber-700', bg: 'bg-amber-100' },
  medium: { label: '유력',   color: 'text-blue-600',  bg: 'bg-blue-50' },
  low:    { label: '감지',   color: 'text-slate-500',  bg: 'bg-slate-100' },
} as const;

const ConfidenceBadge: React.FC<{ confidence: Topic['confidence'] }> = ({ confidence }) => {
  const c = CONFIDENCE_CONFIG[confidence];
  return (
    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${c.bg} ${c.color}`}>
      {c.label}
    </span>
  );
};

// ── 토픽 카드 ──────────────────────────────────────────

const TopicCard: React.FC<{ topic: Topic }> = ({ topic }) => {
  const topPost = topic.representativePosts[0];
  const rank = topic.rank;

  const borderClass = rank <= 2
    ? 'border-amber-300 bg-gradient-to-br from-amber-50/80 to-orange-50/60'
    : 'border-slate-200 bg-gradient-to-br from-white to-slate-50';
  const hoverClass = rank <= 2
    ? 'hover:border-amber-400 hover:shadow-amber-100/50'
    : 'hover:border-indigo-300 hover:shadow-indigo-100/50';

  return (
    <Link
      to={topPost ? `/issue/${topPost.id}` : '#'}
      className={`flex-shrink-0 w-56 p-3.5 rounded-xl border-2 ${borderClass} ${hoverClass} hover:shadow-md transition-all group`}
    >
      {/* 순위 + 위치변동 + 신뢰도 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${rank <= 2 ? 'text-amber-600' : 'text-slate-400'}`}>
            #{rank}
          </span>
          <ChangeIndicator topic={topic} />
        </div>
        <ConfidenceBadge confidence={topic.confidence} />
      </div>

      {/* 헤드라인 */}
      <p className="text-sm font-semibold text-slate-800 line-clamp-2 mb-2 group-hover:text-indigo-600 transition-colors leading-snug">
        {topic.headline}
      </p>

      {/* 채널 분포 */}
      <div className="flex flex-wrap gap-1 mb-2">
        {topic.channels.map(ch => (
          <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
            {ch}
          </span>
        ))}
      </div>

      {/* 포스트 수 + 버스트 표시 */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-400">
          {topic.postCount}개 글에서 논의 중
        </p>
        {topic.burstScore > 2.0 && (
          <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
            🔥 급증
          </span>
        )}
      </div>
    </Link>
  );
};

// ── 키워드 스트립 ──────────────────────────────────────

const MOMENTUM_CONFIG = {
  rising:  { icon: '↑', color: 'text-emerald-600' },
  steady:  { icon: '→', color: 'text-slate-500' },
  falling: { icon: '↓', color: 'text-red-500' },
} as const;

const KeywordStrip: React.FC<{ topics: Topic[] }> = ({ topics }) => {
  const navigate = useNavigate();

  const seen = new Set<string>();
  const keywords: { keyword: string; momentum: Topic['momentum'] }[] = [];
  for (const t of topics) {
    for (const kw of t.keywords) {
      if (seen.has(kw)) continue;
      seen.add(kw);
      keywords.push({ keyword: kw, momentum: t.momentum });
    }
  }

  if (keywords.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mt-3">
      {keywords.slice(0, 15).map(({ keyword, momentum }) => {
        const m = MOMENTUM_CONFIG[momentum];
        return (
          <button
            key={keyword}
            type="button"
            onClick={() => navigate(`/?q=${encodeURIComponent(keyword)}`)}
            className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors
              ${momentum === 'rising'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : momentum === 'falling'
                  ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
          >
            {keyword}
            <span className={`ml-1 ${m.color}`}>{m.icon}</span>
          </button>
        );
      })}
    </div>
  );
};

// ── 스켈레톤 ───────────────────────────────────────────

const Skeleton: React.FC = () => (
  <div className="mb-6">
    <div className="h-4 w-28 bg-slate-200 rounded mb-3 animate-pulse" />
    <div className="flex gap-3 overflow-x-auto pb-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex-shrink-0 w-56 h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />
      ))}
    </div>
  </div>
);

// ── 메인 컴포넌트 ──────────────────────────────────────

export const TrendHero: React.FC = () => {
  const { data, isLoading, isError, refetch } = useTopics();

  if (isLoading) return <Skeleton />;
  if (isError) return <ErrorRetry onRetry={refetch} />;

  const topics = data?.topics ?? [];
  if (topics.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-slate-500 mb-3">
        🔥 지금 뜨는 토픽
      </h2>

      {/* 토픽 카드 가로 스크롤 */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {topics.map(topic => (
          <TopicCard key={topic.id} topic={topic} />
        ))}
      </div>

      {/* 키워드 스트립 */}
      <KeywordStrip topics={topics} />
    </div>
  );
};
