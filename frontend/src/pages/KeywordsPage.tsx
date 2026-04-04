import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchKeywordStats } from '../api/client';
import { ErrorRetry } from '../components/shared/ErrorRetry';
import { WordCloud } from '../components/WordCloud';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { KeywordTone } from '../types';

const TONE_INDICATOR: Record<KeywordTone, { dot: string; label: string }> = {
  positive: { dot: 'bg-emerald-500', label: '긍정' },
  negative: { dot: 'bg-red-500', label: '부정' },
  neutral: { dot: 'bg-slate-400', label: '중립' },
  controversy: { dot: 'bg-amber-500', label: '논란' },
};

const WINDOW_OPTIONS = [
  { value: 3, label: '3시간' },
  { value: 24, label: '24시간' },
] as const;

const RANK_STYLES: Record<number, string> = {
  1: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700',
  2: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600',
  3: 'bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-200 border-orange-300 dark:border-orange-700',
};

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const KeywordsPage: React.FC = () => {
  useDocumentTitle('핫이슈 태그');
  const [windowHours, setWindowHours] = useState(3);
  const [viewMode, setViewMode] = useState<'list' | 'cloud'>('list');
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['keywords', windowHours],
    queryFn: () => fetchKeywordStats(windowHours),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  });

  const handleKeywordClick = (keyword: string) => {
    navigate(`/keyword/${encodeURIComponent(keyword)}`);
  };

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">핫이슈 태그</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {data
              ? `${data.totalPosts.toLocaleString()}개 게시글 기반 · ${formatTime(data.calculatedAt)} 갱신`
              : '키워드 통계를 불러오는 중...'}
          </p>
        </div>

        <div className="flex gap-2">
          {/* 뷰 모드 토글 */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title="리스트 보기"
            >
              목록
            </button>
            <button
              onClick={() => setViewMode('cloud')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'cloud'
                  ? 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title="클라우드 보기"
            >
              클라우드
            </button>
          </div>

          {/* 윈도우 토글 */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {WINDOW_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setWindowHours(opt.value)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  windowHours === opt.value
                    ? 'bg-rose-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-12 bg-slate-100 dark:bg-slate-700 rounded-lg animate-shimmer" />
          ))}
        </div>
      )}

      {/* 에러 */}
      {error && <ErrorRetry onRetry={refetch} />}

      {/* 데이터 없음 */}
      {data && data.keywords.length === 0 && (
        <div className="text-center py-20 text-slate-400 dark:text-slate-500">
          아직 추출된 키워드가 없습니다. 잠시 후 다시 확인해주세요.
        </div>
      )}

      {/* 워드 클라우드 뷰 */}
      {data && data.keywords.length > 0 && viewMode === 'cloud' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <WordCloud keywords={data.keywords} onKeywordClick={handleKeywordClick} />
        </div>
      )}

      {/* 급상승 키워드 섹션 */}
      {data && viewMode === 'list' && (() => {
        const burstKeywords = data.keywords.filter(kw => kw.zScore != null && kw.zScore >= 2.0);
        if (burstKeywords.length === 0) return null;
        return (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="text-red-500">&#x1F525;</span> 급상승 키워드
            </h2>
            <div className="space-y-2">
              {burstKeywords.map(kw => (
                <button
                  key={kw.keyword}
                  onClick={() => handleKeywordClick(kw.keyword)}
                  className="w-full flex items-start gap-3 px-4 py-3 rounded-lg border-l-4 border-l-red-500 border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 transition-all hover:shadow-sm hover:scale-[1.005] text-left"
                >
                  <span className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold bg-red-500 text-white text-xs">
                    {kw.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg font-bold text-slate-900 dark:text-white">{kw.keyword}</span>
                      <span className="flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                        z-score {kw.zScore?.toFixed(1)}
                      </span>
                    </div>
                    {kw.burstExplanation && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{kw.burstExplanation}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                    <span className="text-sm font-semibold">{kw.count.toLocaleString()}회</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{kw.rate}%</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 태그 랭킹 리스트 */}
      {data && data.keywords.length > 0 && viewMode === 'list' && (
        <div className="space-y-2">
          {data.keywords.map(kw => {
            const isTop3 = kw.rank <= 3;
            const isTop10 = kw.rank <= 10;
            const rankStyle = RANK_STYLES[kw.rank] ?? '';

            return (
              <button
                key={kw.keyword}
                onClick={() => handleKeywordClick(kw.keyword)}
                className={`w-full flex items-center gap-3 px-4 rounded-lg border transition-all hover:shadow-sm hover:scale-[1.005] text-left ${
                  isTop3
                    ? `py-4 ${rankStyle}`
                    : isTop10
                      ? 'py-3 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      : 'py-2 bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-sm'
                }`}
              >
                {/* 순위 배지 */}
                <span
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    kw.rank === 1
                      ? 'bg-amber-500 text-white'
                      : kw.rank === 2
                        ? 'bg-slate-400 text-white'
                        : kw.rank === 3
                          ? 'bg-orange-400 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  } ${isTop3 ? 'text-base' : 'text-xs'}`}
                >
                  {kw.rank}
                </span>

                {/* 키워드명 + 톤 + 버스트 설명 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {kw.tone && TONE_INDICATOR[kw.tone] && (
                      <span
                        className={`flex-shrink-0 w-2 h-2 rounded-full ${TONE_INDICATOR[kw.tone].dot}`}
                        title={TONE_INDICATOR[kw.tone].label}
                      />
                    )}
                    <span className={`truncate ${isTop3 ? 'text-lg font-bold' : isTop10 ? 'font-semibold dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>
                      {kw.keyword}
                    </span>
                    {kw.zScore != null && kw.zScore >= 2.0 && (
                      <span className="flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400" title={`z-score: ${kw.zScore}`}>
                        급상승
                      </span>
                    )}
                  </div>
                  {kw.burstExplanation && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{kw.burstExplanation}</p>
                  )}
                </div>

                {/* 언급 수 + Rate */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`${isTop3 ? 'text-sm font-semibold' : 'text-xs text-slate-500 dark:text-slate-400'}`}>
                    {kw.count.toLocaleString()}회
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {kw.rate}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
