import React from 'react';
import type { EntertainmentSub } from './EntertainmentSubTabs';
import type { UnifiedItem, CategoryResult } from '../api/entertainment';
import { useEntertainmentUnified } from '../api/entertainment';
import { RankBadge } from './shared/RankBadge';
import { optimizedImage } from '../utils/imageProxy';
import { timeAgo } from '../utils/timeAgo';

// ── Config ───────────────────────────────────────────

const SECTION_ORDER: { key: string; icon: string; label: string; sub: EntertainmentSub; fallbackIcon: string }[] = [
  { key: 'movie',       icon: '🎬', label: '영화 박스오피스',  sub: 'movie',       fallbackIcon: '🎬' },
  { key: 'music',       icon: '🎵', label: '음악 통합 차트',   sub: 'music',       fallbackIcon: '🎵' },
  { key: 'performance', icon: '🎭', label: '공연 예매순위',    sub: 'performance', fallbackIcon: '🎭' },
  { key: 'books',       icon: '📚', label: '도서 베스트셀러',  sub: 'books',       fallbackIcon: '📚' },
  { key: 'ott',         icon: '📺', label: 'OTT 순위',       sub: 'ott',         fallbackIcon: '📺' },
  { key: 'webtoon',     icon: '📖', label: '웹툰 인기 랭킹', sub: 'webtoon',     fallbackIcon: '📖' },
];

// ── Compact row ──────────────────────────────────────

function UnifiedRow({ item, fallbackIcon }: { item: UnifiedItem; fallbackIcon: string }) {
  const thumbSrc = optimizedImage(item.thumbnail, 112);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
    >
      <RankBadge rank={item.unifiedRank} variant="simple" />

      {/* Thumbnail */}
      <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={item.title}
            loading="lazy"
            decoding="async"
            width={56}
            height={56}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm">
            {fallbackIcon}
          </div>
        )}
      </div>

      {/* Title + source count badge */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">
          {item.title}
        </span>
        {item.sourceCount > 1 && (
          <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 align-middle">
            {item.sourceCount}개 차트
          </span>
        )}
      </div>

      {/* Subtitle */}
      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 max-w-[120px] truncate">
        {item.subtitle}
      </span>
    </a>
  );
}

// ── Section ──────────────────────────────────────────

function UnifiedSection({
  config,
  data,
  onSubTabChange,
}: {
  config: typeof SECTION_ORDER[number];
  data: CategoryResult;
  onSubTabChange: (sub: EntertainmentSub) => void;
}) {
  if (data.items.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header — matches PostCard border style */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {config.icon} {config.label}
          </h3>
          {data.lastUpdated && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {timeAgo(data.lastUpdated)}
            </span>
          )}
        </div>
        <button
          onClick={() => onSubTabChange(config.sub)}
          className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-medium transition-colors"
        >
          더보기 →
        </button>
      </div>

      {/* Items */}
      <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
        {data.items.map(item => (
          <UnifiedRow
            key={`${config.key}-${item.unifiedRank}`}
            item={item}
            fallbackIcon={config.fallbackIcon}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main view ────────────────────────────────────────

interface Props {
  onSubTabChange: (sub: EntertainmentSub) => void;
}

export const EntertainmentUnifiedView: React.FC<Props> = ({ onSubTabChange }) => {
  const { data, isLoading, error } = useEntertainmentUnified();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 animate-pulse rounded-lg h-48" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">엔터테인먼트 데이터를 불러올 수 없습니다</p>
        <p className="text-sm">잠시 후 다시 시도해주세요</p>
      </div>
    );
  }

  const categories = data.categories;
  const visibleSections = SECTION_ORDER.filter(s => categories[s.key]?.items.length > 0);

  if (visibleSections.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">엔터테인먼트 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visibleSections.map(config => (
        <UnifiedSection
          key={config.key}
          config={config}
          data={categories[config.key]}
          onSubTabChange={onSubTabChange}
        />
      ))}
    </div>
  );
};
