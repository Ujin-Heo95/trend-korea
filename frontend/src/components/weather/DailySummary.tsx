import React from 'react';
import type { WeatherDaily } from '../../types';

interface Props {
  today: WeatherDaily;
  tomorrow: WeatherDaily;
}

function formatDate(dateStr: string): string {
  const m = Number(dateStr.slice(4, 6));
  const d = Number(dateStr.slice(6, 8));
  return `${m}월 ${d}일`;
}

function TempDisplay({ label, day }: { label: string; day: WeatherDaily }) {
  const hasData = day.min !== null || day.max !== null;

  return (
    <div className="flex-1 text-center p-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-[11px] text-slate-400 mb-2">{formatDate(day.date)}</p>
      {hasData ? (
        <div className="flex items-center justify-center gap-3">
          {day.min !== null && (
            <div>
              <span className="text-xs text-blue-400">최저</span>
              <p className="text-lg font-bold text-blue-600">{day.min}°</p>
            </div>
          )}
          {day.max !== null && (
            <div>
              <span className="text-xs text-red-400">최고</span>
              <p className="text-lg font-bold text-red-500">{day.max}°</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-300">--</p>
      )}
    </div>
  );
}

export const DailySummary: React.FC<Props> = ({ today, tomorrow }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-4">
    <h3 className="text-sm font-semibold text-slate-700 mb-2">일별 요약</h3>
    <div className="flex divide-x divide-slate-100">
      <TempDisplay label="오늘" day={today} />
      <TempDisplay label="내일" day={tomorrow} />
    </div>
  </div>
);
