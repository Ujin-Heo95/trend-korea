import React from 'react';
import type { Category } from '../types';

const CATEGORIES: { key: Category | undefined; label: string; icon: string }[] = [
  { key: undefined,      label: '전체',     icon: '📋' },
  { key: 'community',    label: '커뮤니티', icon: '💬' },
  { key: 'news',         label: '뉴스',     icon: '📰' },
  { key: 'tech',         label: '테크',     icon: '💻' },
  { key: 'video',        label: '영상',     icon: '🎬' },
  { key: 'finance',      label: '금융',     icon: '📈' },
  { key: 'trend',        label: '트렌드',   icon: '🔍' },
  { key: 'government',   label: '정부',     icon: '🏛️' },
  { key: 'newsletter',   label: '뉴스레터', icon: '✉️' },
  { key: 'deals',        label: '핫딜',     icon: '🏷️' },
];

interface Props {
  selected: Category | undefined;
  onChange: (cat: Category | undefined) => void;
}

export const CategoryTabs: React.FC<Props> = ({ selected, onChange }) => (
  <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
    {CATEGORIES.map(({ key, label, icon }) => (
      <button
        key={label}
        onClick={() => onChange(key)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
          selected === key
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
        }`}
      >
        <span>{icon}</span>
        {label}
      </button>
    ))}
  </div>
);
