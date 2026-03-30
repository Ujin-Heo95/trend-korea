import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchKeywordStats } from '../api/client';
import { ErrorRetry } from '../components/shared/ErrorRetry';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const WINDOW_OPTIONS = [
  { value: 3, label: '3시간' },
  { value: 24, label: '24시간' },
] as const;

const RANK_STYLES: Record<number, string> = {
  1: 'bg-amber-100 text-amber-800 border-amber-300',
  2: 'bg-slate-100 text-slate-700 border-slate-300',
  3: 'bg-orange-50 text-orange-700 border-orange-300',
};

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const KeywordsPage: React.FC = () => {
  useDocumentTitle('핫이슈 태그');
  const [windowHours, setWindowHours] = useState(3);
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['keywords', windowHours],
    queryFn: () => fetchKeywordStats(windowHours),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  });

  const handleKeywordClick = (keyword: string) => {
    navigate(`/?q=${encodeURIComponent(keyword)}`);
  };

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">핫이슈 태그</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data
              ? `${data.totalPosts.toLocaleString()}개 게시글 기반 · ${formatTime(data.calculatedAt)} 갱신`
              : '키워드 통계를 불러오는 중...'}
          </p>
        </div>

        {/* 윈도우 토글 */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {WINDOW_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setWindowHours(opt.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                windowHours === opt.value
                  ? 'bg-rose-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* 에러 */}
      {error && <ErrorRetry onRetry={refetch} />}

      {/* 데이터 없음 */}
      {data && data.keywords.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          아직 추출된 키워드가 없습니다. 잠시 후 다시 확인해주세요.
        </div>
      )}

      {/* 태그 랭킹 리스트 */}
      {data && data.keywords.length > 0 && (
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
                      ? 'py-3 bg-white border-slate-200 hover:border-slate-300'
                      : 'py-2 bg-white border-slate-100 text-sm'
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
                          : 'bg-slate-100 text-slate-500'
                  } ${isTop3 ? 'text-base' : 'text-xs'}`}
                >
                  {kw.rank}
                </span>

                {/* 키워드명 */}
                <span className={`flex-1 truncate ${isTop3 ? 'text-lg font-bold' : isTop10 ? 'font-semibold' : 'text-slate-600'}`}>
                  {kw.keyword}
                </span>

                {/* 언급 수 + Rate */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`${isTop3 ? 'text-sm font-semibold' : 'text-xs text-slate-500'}`}>
                    {kw.count.toLocaleString()}회
                  </span>
                  <span className="text-xs text-slate-400">
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
