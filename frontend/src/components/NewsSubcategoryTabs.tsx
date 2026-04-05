import React from 'react';
import { HorizontalScrollRow } from './shared/HorizontalScrollRow';

const SUBCATEGORIES: { key: string | undefined; label: string }[] = [
  { key: undefined, label: '전체' },
  { key: '사회',     label: '사회' },
  { key: '경제',     label: '경제' },
  { key: '생활',     label: '생활' },
  { key: 'IT/과학',  label: 'IT/과학' },
  { key: '세계',     label: '세계' },
  { key: '연예',     label: '연예' },
  { key: '스포츠',   label: '스포츠' },
  { key: '정치',     label: '정치' },
];

interface Props {
  selected: string | undefined;
  onChange: (sub: string | undefined) => void;
}

export const NewsSubcategoryTabs: React.FC<Props> = ({ selected, onChange }) => (
  <HorizontalScrollRow className="gap-2 pb-2 mb-4">
    {SUBCATEGORIES.map(({ key, label }) => (
      <button
        key={label}
        onClick={() => onChange(key)}
        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
          selected === key
            ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-blue-200 dark:hover:border-blue-500'
        }`}
      >
        {label}
      </button>
    ))}
  </HorizontalScrollRow>
);
