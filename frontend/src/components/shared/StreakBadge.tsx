import React from 'react';
import { useStreak } from '../../hooks/useStreak';

export const StreakBadge: React.FC = () => {
  const { currentStreak } = useStreak();

  if (currentStreak < 2) return null;

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
      title={`${currentStreak}일 연속 방문 중`}
    >
      🔥 {currentStreak}일
    </span>
  );
};
