import React from 'react';
import { SOURCE_COLORS } from '../constants/sourceColors';

const COMMUNITY_SOURCES = [
  { key: 'dcinside', name: 'DC인사이드' },
  { key: 'bobaedream', name: '보배드림' },
  { key: 'theqoo', name: '더쿠' },
  { key: 'instiz', name: '인스티즈' },
  { key: 'natepann', name: '네이트판' },
  { key: 'todayhumor', name: '오늘의유머' },
  { key: 'ppomppu', name: '뽐뿌' },
  { key: 'clien', name: '클리앙' },
  { key: 'fmkorea', name: '에펨코리아' },
  { key: 'mlbpark', name: 'MLB파크' },
  { key: 'cook82', name: '82쿡' },
  { key: 'inven', name: '인벤' },
  { key: 'humoruniv', name: '웃긴대학' },
  { key: 'ygosu', name: '와이고수' },
  { key: 'slrclub', name: 'SLR클럽' },
  { key: 'etoland', name: '에토랜드' },
  { key: 'ddanzi', name: '딴지일보' },
] as const;

interface Props {
  selected: readonly string[];
  onChange: (sources: string[]) => void;
}

export const SourceFilterChips: React.FC<Props> = ({ selected, onChange }) => {
  const isAll = selected.length === 0;

  const toggle = (key: string) => {
    const next = selected.includes(key)
      ? selected.filter(s => s !== key)
      : [...selected, key];
    onChange(next);
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
      <button
        onClick={() => onChange([])}
        className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
          isAll
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-white text-slate-500 border border-slate-200 hover:border-blue-300'
        }`}
      >
        전체
      </button>
      {COMMUNITY_SOURCES.map(({ key, name }) => {
        const active = selected.includes(key);
        const color = SOURCE_COLORS[key] ?? 'bg-slate-100 text-slate-600';
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              active
                ? `${color} ring-1 ring-current shadow-sm`
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
};
