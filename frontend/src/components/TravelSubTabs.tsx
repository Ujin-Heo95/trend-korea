import React from 'react';
import { HorizontalScrollRow } from './shared/HorizontalScrollRow';

export type TravelSub = 'all' | 'hotplace' | 'festival' | 'photo' | 'news';

const SUBS: { key: TravelSub; label: string }[] = [
  { key: 'all',      label: '전체' },
  { key: 'hotplace', label: '핫플레이스' },
  { key: 'festival', label: '축제/행사' },
  { key: 'photo',    label: '관광사진' },
  { key: 'news',     label: '여행뉴스' },
];

interface Props {
  selected: TravelSub;
  onChange: (sub: TravelSub) => void;
}

export const TravelSubTabs: React.FC<Props> = ({ selected, onChange }) => (
  <HorizontalScrollRow className="gap-2 pb-2 mb-4">
    {SUBS.map(({ key, label }) => {
      const isActive = selected === key;
      return (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
            isActive
              ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-blue-200 dark:hover:border-blue-500'
          }`}
        >
          {label}
        </button>
      );
    })}
  </HorizontalScrollRow>
);
