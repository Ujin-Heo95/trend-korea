import React from 'react';
import { useQueryClient } from '@tanstack/react-query';

function relativeTime(now: number, ts: number): string {
  const sec = Math.floor((now - ts) / 1000);
  if (sec < 10) return '방금 전';
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}

export const LivePulse: React.FC = () => {
  const queryClient = useQueryClient();
  const state = queryClient.getQueryState(['posts', { page: 0 }]) ??
                queryClient.getQueryState(['topics']);

  const [now, setNow] = React.useState(() => Date.now());

  // re-render every 15s to update relative time
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!state?.dataUpdatedAt) return null;

  const isFresh = now - state.dataUpdatedAt < 30_000;

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isFresh
            ? 'bg-emerald-500 animate-live-pulse'
            : 'bg-slate-300 dark:bg-slate-600'
        }`}
      />
      <span>{relativeTime(now, state.dataUpdatedAt)} 업데이트</span>
    </div>
  );
};
