import React from 'react';

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
  <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
    {SUBCATEGORIES.map(({ key, label }) => (
      <button
        key={label}
        onClick={() => onChange(key)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
          selected === key
            ? 'bg-blue-500 text-white shadow-sm'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);
