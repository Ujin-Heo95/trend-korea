import React from 'react';
import { Link } from 'react-router-dom';
import type { Topic } from '../types';
import { optimizedImage } from '../utils/imageProxy';

// ── 순위 배지 스타일 ──

const RANK_STYLES: Record<number, string> = {
  1: 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white',
  2: 'bg-gradient-to-br from-slate-300 to-slate-400 text-white',
  3: 'bg-gradient-to-br from-orange-400 to-amber-600 text-white',
};

// ── 순위 변동 ──

const ChangeIndicator: React.FC<{ topic: Topic }> = ({ topic }) => {
  if (topic.changeType === 'new') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white leading-none">NEW</span>;
  }
  if (topic.changeType === 'up') {
    return <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">▲{topic.changeAmount}</span>;
  }
  if (topic.changeType === 'down') {
    return <span className="text-[10px] font-bold text-red-400">▼{topic.changeAmount}</span>;
  }
  return <span className="text-[10px] text-slate-400 dark:text-slate-500">—</span>;
};

// ── 모멘텀 배지 ──

function MomentumBadge({ momentum }: { momentum: Topic['momentum'] }) {
  if (momentum === 'rising') {
    return <span className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">🔥 급상승</span>;
  }
  if (momentum === 'falling') {
    return <span className="text-[11px] text-slate-400 dark:text-slate-500">📉 하락</span>;
  }
  return null;
}

// ── 소스 목록 텍스트 ──

function SourceSummary({ sources, sourceCount }: { sources: Topic['sources']; sourceCount: number }) {
  const display = sources.slice(0, 2).map(s => s.name);
  const rest = sourceCount - display.length;
  return (
    <span className="text-[11px] text-slate-500 dark:text-slate-400">
      📰 {display.join(', ')}
      {rest > 0 && <span className="text-slate-400 dark:text-slate-500"> 외 {rest}개</span>}
    </span>
  );
}

// ── 메인 컴포넌트 ──

interface Props {
  topics: Topic[];
}

export const UnifiedRankingList: React.FC<Props> = ({ topics }) => {
  if (topics.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
        <span>📊</span> 실시간 이슈 랭킹
      </h2>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/50 overflow-hidden">
        {topics.map((topic) => {
          const linkTo = topic.representativePosts[0]
            ? `/issue/${topic.representativePosts[0].id}`
            : '#';
          const thumb = optimizedImage(topic.thumbnail, 160);

          return (
            <Link
              key={topic.id}
              to={linkTo}
              className="flex gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors group"
            >
              {/* 썸네일 */}
              {thumb ? (
                <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-2xl">
                  {topic.channels[0] === '뉴스' ? '📰' : topic.channels[0] === '커뮤니티' ? '💬' : topic.channels[0] === '테크' ? '💻' : '📋'}
                </div>
              )}

              {/* 콘텐츠 */}
              <div className="flex-1 min-w-0">
                {/* 상단: 순위 + 변동 + 헤드라인 */}
                <div className="flex items-start gap-2 mb-1">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                    RANK_STYLES[topic.rank] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    {topic.rank}
                  </span>
                  <ChangeIndicator topic={topic} />
                </div>

                {/* AI 헤드라인 or 기본 헤드라인 */}
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 mb-1">
                  {topic.summaryHeadline ?? topic.headline}
                </h3>

                {/* AI 요약 본문 */}
                {topic.summaryBody && (
                  <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-3 mb-1.5">
                    {topic.summaryBody}
                  </p>
                )}

                {/* 키워드 태그 */}
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {topic.keywords.map(kw => (
                    <span key={kw} className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      #{kw}
                    </span>
                  ))}
                </div>

                {/* 하단: 소스 + 게시글 수 + 모멘텀 */}
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <SourceSummary sources={topic.sources} sourceCount={topic.sourceCount} />
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span className="text-slate-500 dark:text-slate-400">{topic.postCount}건</span>
                  <MomentumBadge momentum={topic.momentum} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
