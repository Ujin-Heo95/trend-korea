import React from 'react';
import type { TimeWindow } from '../hooks/useIssueRankings';

const WINDOWS: { key: TimeWindow; label: string }[] = [
  { key: '12h', label: '실시간' },
  { key: '6h',  label: '6시간' },
  { key: '24h', label: '24시간' },
];

interface Props {
  selected: TimeWindow;
  onChange: (w: TimeWindow) => void;
}

export const TimeWindowTabs: React.FC<Props> = ({ selected, onChange }) => (
  <div className="flex gap-1 px-4 pb-2 mb-2">
    {WINDOWS.map(({ key, label }) => {
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
  </div>
);
