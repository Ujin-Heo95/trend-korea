import React from 'react';
import type { WeatherHourly } from '../../types';
import { WeatherIcon } from './WeatherIcon';

interface Props {
  hourly: WeatherHourly[];
}

function formatTime(fcstTime: string): string {
  const h = Number(fcstTime.slice(0, 2));
  if (h === 0) return '자정';
  if (h === 12) return '정오';
  return h < 12 ? `오전 ${h}시` : `오후 ${h - 12}시`;
}

function formatDate(fcstDate: string): string {
  const m = Number(fcstDate.slice(4, 6));
  const d = Number(fcstDate.slice(6, 8));
  return `${m}/${d}`;
}

export const HourlyForecast: React.FC<Props> = ({ hourly }) => {
  // 날짜 변경 시점 감지용
  let lastDate = '';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">시간별 예보</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {hourly.map((h, i) => {
          const showDate = h.fcstDate !== lastDate;
          lastDate = h.fcstDate;

          return (
            <React.Fragment key={`${h.fcstDate}-${h.fcstTime}`}>
              {showDate && i > 0 && (
                <div className="flex flex-col items-center justify-center px-1">
                  <div className="w-px h-full bg-slate-200" />
                  <span className="text-[10px] text-slate-400 whitespace-nowrap my-1">
                    {formatDate(h.fcstDate)}
                  </span>
                  <div className="w-px h-full bg-slate-200" />
                </div>
              )}
              <div className="flex flex-col items-center gap-1 min-w-[52px]">
                <span className="text-[11px] text-slate-400">{formatTime(h.fcstTime)}</span>
                <WeatherIcon sky={h.sky} pty={h.pty} />
                <span className="text-sm font-semibold text-slate-800">{h.temp}°</span>
                {h.precipProb > 0 && (
                  <span className="text-[10px] text-blue-500">{h.precipProb}%</span>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
