import React from 'react';
import { getSourceColor } from '../constants/sourceColors';
import { HorizontalScrollRow } from './shared/HorizontalScrollRow';

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
    <HorizontalScrollRow className="gap-2 pb-2">
      <button
        onClick={() => onChange([])}
        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
          isAll
            ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-blue-200 dark:hover:border-blue-500'
        }`}
      >
        전체
      </button>
      {COMMUNITY_SOURCES.map(({ key, name }) => {
        const active = selected.includes(key);
        const color = getSourceColor(key, 'community');
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
              active
                ? `${color} border-current/20 shadow-sm`
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-blue-200 dark:hover:border-blue-500'
            }`}
          >
            {name}
          </button>
        );
      })}
    </HorizontalScrollRow>
  );
};
