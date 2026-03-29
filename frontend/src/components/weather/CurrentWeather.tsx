import React from 'react';
import type { WeatherCurrent, WeatherDaily } from '../../types';
import { WeatherIcon, getWeatherDisplay } from './WeatherIcon';

interface Props {
  city: string;
  current: WeatherCurrent;
  daily: { today: WeatherDaily; tomorrow: WeatherDaily };
}

export const CurrentWeather: React.FC<Props> = ({ city, current, daily }) => {
  const { label } = getWeatherDisplay(current.sky, current.pty);

  return (
    <div className="bg-gradient-to-br from-sky-50 to-blue-50 rounded-2xl p-6 border border-sky-100">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-700 mb-1">{city}</h2>
          <div className="flex items-end gap-2">
            <span className="text-5xl font-bold text-slate-900">{current.temp}°</span>
            <span className="text-lg text-slate-500 mb-1.5">{label}</span>
          </div>
          {daily.today.min !== null && daily.today.max !== null && (
            <p className="text-sm text-slate-500 mt-1">
              최저 {daily.today.min}° / 최고 {daily.today.max}°
            </p>
          )}
        </div>
        <WeatherIcon sky={current.sky} pty={current.pty} size="lg" />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-sky-200/50">
        <div className="text-center">
          <p className="text-xs text-slate-400">습도</p>
          <p className="text-sm font-semibold text-slate-700">{current.humidity}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-400">풍속</p>
          <p className="text-sm font-semibold text-slate-700">{current.windSpeed}m/s</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-400">강수확률</p>
          <p className="text-sm font-semibold text-slate-700">{current.precipProb}%</p>
        </div>
      </div>
    </div>
  );
};
