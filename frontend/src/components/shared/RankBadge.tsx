import React from 'react';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_LABELS = ['1위', '2위', '3위'];

export const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  if (rank >= 1 && rank <= 3) {
    return <span className="text-lg" role="img" aria-label={MEDAL_LABELS[rank - 1]}>{MEDALS[rank - 1]}</span>;
  }
  return (
    <span className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold">
      {rank}
    </span>
  );
};
