import React from 'react';

export type EntertainmentSub = 'all' | 'books' | 'ott' | 'music' | 'movie' | 'performance';

const SUBS: { key: EntertainmentSub; label: string }[] = [
  { key: 'all',         label: '전체' },
  { key: 'books',       label: '도서' },
  { key: 'ott',         label: 'OTT' },
  { key: 'music',       label: '음악' },
  { key: 'movie',       label: '영화' },
  { key: 'performance', label: '공연' },
];

interface Props {
  selected: EntertainmentSub;
  onChange: (sub: EntertainmentSub) => void;
}

export const EntertainmentSubTabs: React.FC<Props> = ({ selected, onChange }) => (
  <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
    {SUBS.map(({ key, label }) => {
      const isActive = selected === key;
      return (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            isActive
              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700'
              : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:border-indigo-200'
          }`}
        >
          {label}
        </button>
      );
    })}
  </div>
);
