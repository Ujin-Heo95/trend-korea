import React, { useMemo } from 'react';
import { useSources } from '../hooks/usePosts';
import { getSourceLabel, getSourceBrandStyle } from '../constants/sourceColors';
import { HorizontalScrollRow } from './shared/HorizontalScrollRow';

interface Props {
  /** 현재 카테고리 (community, news 등) — 해당 카테고리 소스만 표시 */
  category?: string;
  selected: readonly string[];
  onChange: (sources: string[]) => void;
}

// 단일 선택(정확히 1개, 또는 '전체' = 0개)일 때만 내부를 브랜드 색으로 채운다.
// 다중 선택 또는 비활성 상태에서는 투명 배경 + 검정(다크: 흰색) 테두리/글씨.
const BASE_CLS =
  'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ' +
  'text-slate-900 dark:text-slate-100 border-slate-900 dark:border-slate-100';

const INACTIVE_CLS = 'bg-transparent hover:bg-slate-900/5 dark:hover:bg-slate-100/10';
const MULTI_SELECTED_CLS = 'bg-transparent font-semibold ring-2 ring-slate-900 dark:ring-slate-100';

export const SourceFilterChips: React.FC<Props> = ({ category, selected, onChange }) => {
  const { data: allSources = [] } = useSources();

  const sources = useMemo(() => {
    if (!category) return [];
    const cats = category.split(',');
    return allSources
      .filter(s => cats.includes(s.category) && s.post_count > 0)
      .sort((a, b) => b.post_count - a.post_count);
  }, [allSources, category]);

  const toggle = (key: string) => {
    const next = selected.includes(key)
      ? selected.filter(s => s !== key)
      : [...selected, key];
    onChange(next);
  };

  if (sources.length === 0) return null;

  const isAllActive = selected.length === 0;
  const soleSelection = selected.length === 1 ? selected[0] : null;

  return (
    <HorizontalScrollRow className="gap-2 pb-2">
      <button
        onClick={() => onChange([])}
        className={`${BASE_CLS} ${
          isAllActive ? 'bg-slate-900/10 dark:bg-slate-100/20 font-semibold' : INACTIVE_CLS
        }`}
      >
        전체
      </button>
      {sources.map(({ key, name }) => {
        const isSelected = selected.includes(key);
        const isSole = soleSelection === key;
        const brandStyle = getSourceBrandStyle(key);
        const label = getSourceLabel(key, name);

        // 내부 채움은 '단일 선택' 상태에서만. 글씨/테두리는 항상 검정(다크: 흰색).
        const style: React.CSSProperties | undefined = isSole && brandStyle
          ? { backgroundColor: brandStyle.backgroundColor }
          : undefined;

        const stateCls = isSole
          ? brandStyle
            ? 'font-semibold'
            : 'bg-slate-900/10 dark:bg-slate-100/20 font-semibold'
          : isSelected
            ? MULTI_SELECTED_CLS
            : INACTIVE_CLS;

        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            style={style}
            className={`${BASE_CLS} ${stateCls}`}
          >
            {label}
          </button>
        );
      })}
    </HorizontalScrollRow>
  );
};
