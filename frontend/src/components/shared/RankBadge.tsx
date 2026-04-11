import React from 'react';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_LABELS = ['1위', '2위', '3위'];

export const RankBadge: React.FC<{ rank: number; variant?: 'default' | 'simple' }> = ({ rank, variant = 'default' }) => {
  if (variant === 'default' && rank >= 1 && rank <= 3) {
    return <span className="text-lg" role="img" aria-label={MEDAL_LABELS[rank - 1]}>{MEDALS[rank - 1]}</span>;
  }
  return (
    <span className={`w-7 text-center font-bold tabular-nums ${
      rank <= 3 ? 'text-amber-500 dark:text-amber-400 text-base' : 'text-slate-400 dark:text-slate-500 text-sm'
    }`}>
      {rank}
    </span>
  );
};
