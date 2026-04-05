import React from 'react';
import { HorizontalScrollRow } from './shared/HorizontalScrollRow';

const CATEGORIES: { key: string | undefined; label: string; icon: string }[] = [
  { key: undefined,                                                label: '전체',        icon: '📋' },
  { key: 'community',                                             label: '커뮤니티',    icon: '💬' },
  { key: 'news,press,newsletter,tech',                            label: '뉴스',        icon: '📰' },
  { key: 'video',                                                 label: '영상',        icon: '🎬' },
  { key: 'deals',                                                 label: '핫딜',        icon: '🔥' },
  { key: 'entertainment',                                         label: '엔터테인먼트', icon: '🎭' },
  { key: 'travel',                                                label: '여행',        icon: '✈️' },
  { key: 'sns',                                                  label: 'SNS',        icon: '📱' },
];

interface Props {
  selected: string | undefined;
  onChange: (cat: string | undefined) => void;
}

export const CategoryTabs: React.FC<Props> = ({ selected, onChange }) => (
  <HorizontalScrollRow role="tablist" ariaLabel="카테고리" className="gap-2 pb-2 mb-4">
    {CATEGORIES.map(({ key, label, icon }) => {
      const isSelected = selected === key;
      return (
        <button
          key={label}
          role="tab"
          aria-selected={isSelected}
          aria-controls="posts-panel"
          onClick={() => onChange(key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            isSelected
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-500'
          }`}
        >
          <span aria-hidden="true">{icon}</span>
          {label}
        </button>
      );
    })}
  </HorizontalScrollRow>
);
