import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { KeywordStat } from '../types';

interface WordCloudProps {
  keywords: KeywordStat[];
  onKeywordClick?: (keyword: string) => void;
}

function getFontSize(count: number, max: number, min: number): number {
  if (max === min) return 20;
  const normalized = (count - min) / (max - min);
  return 12 + normalized * 32; // 12px ~ 44px
}

function getColor(zScore: number | undefined, rank: number, tone?: string): string {
  // 급상승은 항상 빨강
  if (zScore != null && zScore >= 2.0) return 'text-red-600 dark:text-red-400';
  // 톤 기반 색상 (Top 10 이내에서만)
  if (rank <= 10 && tone) {
    if (tone === 'negative') return 'text-rose-600 dark:text-rose-400';
    if (tone === 'controversy') return 'text-amber-600 dark:text-amber-400';
    if (tone === 'positive') return 'text-emerald-600 dark:text-emerald-400';
  }
  if (rank <= 3) return 'text-indigo-700 dark:text-indigo-300';
  if (rank <= 10) return 'text-blue-600 dark:text-blue-400';
  return 'text-slate-600 dark:text-slate-400';
}

// 결정적 셔플: 키워드 목록이 바뀔 때만 재계산
function deterministicShuffle(keywords: KeywordStat[]): KeywordStat[] {
  const arr = [...keywords];
  let seed = arr.reduce((s, k) => s + k.keyword.charCodeAt(0) + k.count, 0);
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const WordCloud: React.FC<WordCloudProps> = ({ keywords, onKeywordClick }) => {
  const navigate = useNavigate();
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const shuffled = useMemo(() => deterministicShuffle(keywords), [keywords]);

  if (keywords.length === 0) return null;

  const counts = keywords.map(k => k.count);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);

  const handleClick = (keyword: string) => {
    if (onKeywordClick) {
      onKeywordClick(keyword);
    } else {
      navigate(`/keyword/${encodeURIComponent(keyword)}`);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-4 min-h-[200px]">
      {shuffled.map(kw => {
        const fontSize = getFontSize(kw.count, maxCount, minCount);
        const colorClass = getColor(kw.zScore, kw.rank, kw.tone);
        const isBurst = kw.zScore != null && kw.zScore >= 2.0;
        const isActive = activeTooltip === kw.keyword;

        return (
          <div key={kw.keyword} className="relative inline-block">
            <button
              onClick={() => handleClick(kw.keyword)}
              onMouseEnter={() => isBurst && setActiveTooltip(kw.keyword)}
              onMouseLeave={() => setActiveTooltip(null)}
              className={`inline-block font-medium transition-all hover:scale-110 hover:opacity-80 cursor-pointer ${colorClass} ${isBurst ? 'animate-pulse' : ''}`}
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.2 }}
              aria-label={`${kw.keyword} — ${kw.count}회${isBurst ? ' (급상승)' : ''}`}
            >
              {kw.keyword}
            </button>
            {/* 버스트 키워드 팝오버 */}
            {isBurst && isActive && kw.burstExplanation && (
              <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg shadow-lg bg-white dark:bg-slate-700 border border-red-200 dark:border-red-800 text-sm pointer-events-none">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-red-500 text-xs">&#x1F525;</span>
                  <span className="font-semibold text-red-600 dark:text-red-400 text-xs">급상승</span>
                  <span className="text-xs text-slate-400 ml-auto">z-score {kw.zScore?.toFixed(1)}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{kw.burstExplanation}</p>
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 rotate-45 bg-white dark:bg-slate-700 border-b border-r border-red-200 dark:border-red-800" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
