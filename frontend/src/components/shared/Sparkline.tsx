import React from 'react';

interface SparklineProps {
  data: { ratio: number }[];
  width?: number;
  height?: number;
  className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({ data, width = 72, height = 20, className }) => {
  if (data.length < 2) return null;

  const padding = 2;
  const ratios = data.map(d => d.ratio);
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  const range = max - min || 1;

  const points = ratios
    .map((r, i) => {
      const x = padding + (i / (ratios.length - 1)) * (width - padding * 2);
      const y = height - padding - ((r - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const isUp = ratios[ratios.length - 1] >= ratios[0];
  const color = isUp ? '#f59e0b' : '#94a3b8';

  const lastX = padding + ((ratios.length - 1) / (ratios.length - 1)) * (width - padding * 2);
  const lastY = height - padding - ((ratios[ratios.length - 1] - min) / range) * (height - padding * 2);

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
};
