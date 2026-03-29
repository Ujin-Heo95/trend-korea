import React from 'react';

/** SKY + PTY 코드를 날씨 아이콘/라벨로 변환 */
export function getWeatherDisplay(sky: number, pty: number): { icon: string; label: string } {
  // PTY 우선 (강수가 있으면 강수 표시)
  if (pty === 1) return { icon: '🌧️', label: '비' };
  if (pty === 2) return { icon: '🌨️', label: '비/눈' };
  if (pty === 3) return { icon: '❄️', label: '눈' };
  if (pty === 4) return { icon: '🌦️', label: '소나기' };

  // PTY=0이면 SKY 기준
  if (sky === 1) return { icon: '☀️', label: '맑음' };
  if (sky === 3) return { icon: '⛅', label: '구름많음' };
  if (sky === 4) return { icon: '☁️', label: '흐림' };

  return { icon: '☀️', label: '맑음' };
}

interface Props {
  sky: number;
  pty: number;
  size?: 'sm' | 'lg';
}

export const WeatherIcon: React.FC<Props> = ({ sky, pty, size = 'sm' }) => {
  const { icon } = getWeatherDisplay(sky, pty);
  return <span className={size === 'lg' ? 'text-5xl' : 'text-xl'}>{icon}</span>;
};
