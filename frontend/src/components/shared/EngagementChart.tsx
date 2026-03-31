import React from 'react';

interface DataPoint {
  view_count: number;
  captured_at: string;
}

interface EngagementChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
}

export const EngagementChart: React.FC<EngagementChartProps> = ({ data, width = 320, height = 120 }) => {
  if (data.length < 2) return null;

  const padX = 40;
  const padY = 16;
  const chartW = width - padX - 8;
  const chartH = height - padY * 2;

  const views = data.map(d => d.view_count);
  const min = Math.min(...views);
  const max = Math.max(...views);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * chartW;
    const y = padY + chartH - ((d.view_count - min) / range) * chartH;
    return { x, y };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `M${points[0].x},${padY + chartH} ${points.map(p => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${padY + chartH} Z`;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatCount = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}만` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

  // Y-axis labels: min, mid, max
  const yLabels = [max, Math.round((max + min) / 2), min];

  return (
    <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      {/* Y-axis labels */}
      {yLabels.map((val, i) => {
        const y = padY + (i / 2) * chartH;
        return (
          <text key={i} x={padX - 4} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="10">
            {formatCount(val)}
          </text>
        );
      })}
      {/* Area fill */}
      <path d={areaPath} fill="url(#engGrad)" opacity="0.3" />
      {/* Line */}
      <polyline points={polyline} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots at first and last */}
      <circle cx={points[0].x} cy={points[0].y} r="3" fill="#3b82f6" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill="#3b82f6" />
      {/* X-axis: first and last time */}
      <text x={points[0].x} y={height - 2} textAnchor="start" className="fill-slate-400" fontSize="10">
        {formatTime(data[0].captured_at)}
      </text>
      <text x={points[points.length - 1].x} y={height - 2} textAnchor="end" className="fill-slate-400" fontSize="10">
        {formatTime(data[data.length - 1].captured_at)}
      </text>
      <defs>
        <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};
