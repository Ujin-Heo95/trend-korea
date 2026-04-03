import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchWeather } from '../api/client';
import { CitySelector } from '../components/weather/CitySelector';
import { CurrentWeather } from '../components/weather/CurrentWeather';
import { HourlyForecast } from '../components/weather/HourlyForecast';
import { DailySummary } from '../components/weather/DailySummary';

function WeatherSkeleton() {
  return (
    <div className="space-y-4 animate-shimmer">
      <div className="h-48 bg-sky-50 dark:bg-sky-900/30 rounded-2xl" />
      <div className="h-32 bg-slate-100 dark:bg-slate-700 rounded-2xl" />
      <div className="h-24 bg-slate-100 dark:bg-slate-700 rounded-2xl" />
    </div>
  );
}

export const WeatherPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const cityCode = params.get('city') || 'seoul';

  const handleCityChange = (code: string) => {
    setParams({ city: code });
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['weather', cityCode],
    queryFn: () => fetchWeather(cityCode),
    staleTime: 10 * 60_000,
    retry: 1,
  });

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-4">날씨 예보</h1>

      <CitySelector selected={cityCode} onChange={handleCityChange} />

      {isLoading && <WeatherSkeleton />}

      {isError && (
        <div className="text-center py-16">
          <p className="text-slate-500 dark:text-slate-400 mb-3">날씨 정보를 불러올 수 없습니다.</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <CurrentWeather
            city={data.city}
            current={data.current}
            daily={data.daily}
          />
          <HourlyForecast hourly={data.hourly} />
          <DailySummary today={data.daily.today} tomorrow={data.daily.tomorrow} />

          <p className="text-[11px] text-slate-300 dark:text-slate-600 text-right">
            기상청 단기예보 | 발표 {data.baseDate.slice(4, 6)}/{data.baseDate.slice(6, 8)} {data.baseTime.slice(0, 2)}:{data.baseTime.slice(2)}
          </p>
        </div>
      )}
    </div>
  );
};
