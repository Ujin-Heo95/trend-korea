import React from 'react';
import type { KeywordStat } from '../types';

interface WordCloudProps {
  keywords: KeywordStat[];
  onKeywordClick: (keyword: string) => void;
}

function getFontSize(count: number, max: number, min: number): number {
  if (max === min) return 20;
  const normalized = (count - min) / (max - min);
  return 12 + normalized * 32; // 12px ~ 44px
}

function getColor(zScore: number | undefined, rank: number): string {
  // 급상승: 빨강 계열
  if (zScore != null && zScore >= 2.0) return 'text-red-600 dark:text-red-400';
  // Top 3: 강조색
  if (rank <= 3) return 'text-indigo-700 dark:text-indigo-300';
  // Top 10: 중간
  if (rank <= 10) return 'text-blue-600 dark:text-blue-400';
  // 나머지: 연한 색
  return 'text-slate-600 dark:text-slate-400';
}

export const WordCloud: React.FC<WordCloudProps> = ({ keywords, onKeywordClick }) => {
  if (keywords.length === 0) return null;

  const counts = keywords.map(k => k.count);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);

  // 시각적 다양성: 키워드를 섞어서 배치
  const shuffled = [...keywords].sort(() => Math.random() - 0.5);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-4 min-h-[200px]">
      {shuffled.map(kw => {
        const fontSize = getFontSize(kw.count, maxCount, minCount);
        const colorClass = getColor(kw.zScore, kw.rank);
        const isBurst = kw.zScore != null && kw.zScore >= 2.0;

        return (
          <button
            key={kw.keyword}
            onClick={() => onKeywordClick(kw.keyword)}
            className={`inline-block font-medium transition-all hover:scale-110 hover:opacity-80 cursor-pointer ${colorClass} ${isBurst ? 'animate-pulse' : ''}`}
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.2 }}
            title={`${kw.count.toLocaleString()}회 (${kw.rate}%)${kw.burstExplanation ? ` — ${kw.burstExplanation}` : ''}`}
          >
            {kw.keyword}
          </button>
        );
      })}
    </div>
  );
};
