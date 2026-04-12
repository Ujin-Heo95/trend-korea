import React, { useMemo } from 'react';
import { useSources } from '../hooks/usePosts';
import { getSourceColor, getSourceLabel, getSourceBrandStyle } from '../constants/sourceColors';
import { HorizontalScrollRow } from './shared/HorizontalScrollRow';

interface Props {
  /** 현재 카테고리 (community, news 등) — 해당 카테고리 소스만 표시 */
  category?: string;
  selected: readonly string[];
  onChange: (sources: string[]) => void;
}

export const SourceFilterChips: React.FC<Props> = ({ category, selected, onChange }) => {
  const { data: allSources = [] } = useSources();

  const sources = useMemo(() => {
    if (!category) return [];
    const cats = category.split(',');
    const HIDDEN_KEYS = new Set(['youtube', 'youtube_search']);
    return allSources
      .filter(s => cats.includes(s.category) && s.post_count > 0 && !HIDDEN_KEYS.has(s.key))
      .sort((a, b) => b.post_count - a.post_count);
  }, [allSources, category]);

  const isAll = selected.length === 0;

  const toggle = (key: string) => {
    const next = selected.includes(key)
      ? selected.filter(s => s !== key)
      : [...selected, key];
    onChange(next);
  };

  if (sources.length === 0) return null;

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
      {sources.map(({ key, name, category: cat }) => {
        const active = selected.includes(key);
        const color = getSourceColor(key, cat);
        const brandStyle = getSourceBrandStyle(key);
        const label = getSourceLabel(key, name);
        const style: React.CSSProperties | undefined = brandStyle
          ? {
              ...brandStyle,
              borderColor: active
                ? brandStyle.color as string
                : `color-mix(in srgb, ${brandStyle.color} 45%, transparent)`,
            }
          : undefined;
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            style={style}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              brandStyle ? '' : `${color} ${active ? 'border-current/40' : 'border-current/25'}`
            } ${active ? 'shadow-sm font-semibold' : 'hover:brightness-110'}`}
          >
            {label}
          </button>
        );
      })}
    </HorizontalScrollRow>
  );
};
