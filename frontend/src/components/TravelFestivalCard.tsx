import React, { useMemo, useState } from 'react';
import type { Post } from '../types';
import { PosterImage } from './shared/PosterImage';

interface FestivalMeta {
  description?: string;
  eventPeriod?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  subjectCategory?: string;
  spatialCoverage?: string;
  address?: string;
}

function parseFestivalMeta(post: Post): FestivalMeta | null {
  const m = post.metadata as FestivalMeta | undefined;
  if (!m) return null;
  if (m.eventPeriod || m.eventStartDate || m.spatialCoverage || m.subjectCategory) return m;
  return null;
}

function formatPeriod(meta: FestivalMeta): string | null {
  if (meta.eventPeriod) return meta.eventPeriod;
  if (meta.eventStartDate) {
    const start = formatYmd(meta.eventStartDate);
    const end = meta.eventEndDate ? formatYmd(meta.eventEndDate) : '';
    return end ? `${start} ~ ${end}` : start;
  }
  return null;
}

function formatYmd(d: string): string {
  if (d.length !== 8) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function getPeriodStatus(meta: FestivalMeta): 'ongoing' | 'upcoming' | 'ended' | null {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10).replace(/-/g, '');

  if (meta.eventStartDate && meta.eventEndDate) {
    if (todayStr < meta.eventStartDate) return 'upcoming';
    if (todayStr > meta.eventEndDate) return 'ended';
    return 'ongoing';
  }

  if (meta.eventPeriod) {
    const dateMatch = meta.eventPeriod.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g);
    if (dateMatch && dateMatch.length >= 2) {
      const startParts = dateMatch[0].replace(/[.\-/]/g, '');
      const endParts = dateMatch[1].replace(/[.\-/]/g, '');
      // 유효한 8자리 날짜만 사용 (YYYYMMDD)
      if (startParts.length < 8 || endParts.length < 8) return null;
      if (todayStr < startParts) return 'upcoming';
      if (todayStr > endParts) return 'ended';
      return 'ongoing';
    }
  }

  return null;
}

const STATUS_STYLES = {
  ongoing: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  upcoming: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  ended: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
};
const STATUS_LABELS = { ongoing: '진행중', upcoming: '예정', ended: '종료' };

export const TravelFestivalCard: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const festivals = useMemo(() =>
    posts
      .map(p => ({ post: p, meta: parseFestivalMeta(p) }))
      .filter((f): f is { post: Post; meta: FestivalMeta } => f.meta !== null),
    [posts],
  );

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const { meta } of festivals) {
      if (meta.spatialCoverage) set.add(meta.spatialCoverage);
    }
    return [...set].sort();
  }, [festivals]);

  const [regionFilter, setRegionFilter] = useState<string | undefined>(undefined);

  const filtered = useMemo(() =>
    regionFilter ? festivals.filter(f => f.meta.spatialCoverage === regionFilter) : festivals,
    [festivals, regionFilter],
  );

  if (festivals.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">축제/행사 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {regions.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setRegionFilter(undefined)}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              !regionFilter
                ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}
          >
            전체
          </button>
          {regions.map(r => (
            <button
              key={r}
              onClick={() => setRegionFilter(r)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                regionFilter === r
                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map(({ post, meta }) => {
          const period = formatPeriod(meta);
          const status = getPeriodStatus(meta);

          return (
            <a
              key={post.id}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 bg-white dark:bg-slate-800 px-4 py-3 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors"
            >
              <PosterImage
                src={post.thumbnail}
                alt={post.title}
                width={72}
                height={72}
                fallbackIcon="🎪"
                className="flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                  {post.title}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {status && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLES[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                  )}
                  {meta.spatialCoverage && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                      {meta.spatialCoverage}
                    </span>
                  )}
                  {meta.subjectCategory && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                      {meta.subjectCategory}
                    </span>
                  )}
                </div>
                {period && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{period}</p>
                )}
                {meta.description && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-1">
                    {meta.description}
                  </p>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};
