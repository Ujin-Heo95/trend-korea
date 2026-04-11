import React, { useMemo, useState } from 'react';
import type { Post } from '../../types';
import { PosterImage } from '../shared/PosterImage';

interface NormalizedEvent {
  post: Post;
  region: string;
  startDate: string;
  endDate: string;
  fee: string | null;
  genre: string | null;
  place: string | null;
  status: 'ongoing' | 'upcoming' | 'ended';
}

function getStatus(start: string, end: string): 'ongoing' | 'upcoming' | 'ended' {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const s = start.replace(/[.\-/]/g, '').slice(0, 8);
  const e = end.replace(/[.\-/]/g, '').slice(0, 8);
  if (s.length < 8 || e.length < 8) return 'ongoing';
  if (today < s) return 'upcoming';
  if (today > e) return 'ended';
  return 'ongoing';
}

function formatYmd(d: string): string {
  const clean = d.replace(/[.\-/]/g, '');
  if (clean.length < 8) return d;
  return `${clean.slice(4, 6)}.${clean.slice(6, 8)}`;
}

function normalize(post: Post): NormalizedEvent | null {
  const m = post.metadata as Record<string, unknown> | undefined;
  if (!m) return null;

  // seoul_cultural_event
  if (m.district || m.genre) {
    const start = String(m.startDate ?? '');
    const end = String(m.endDate ?? '');
    return {
      post,
      region: String(m.district ?? ''),
      startDate: start,
      endDate: end,
      fee: m.fee ? String(m.fee) : null,
      genre: m.genre ? String(m.genre) : null,
      place: m.place ? String(m.place) : null,
      status: start && end ? getStatus(start, end) : 'ongoing',
    };
  }

  // tour_festival
  if (m.eventStartDate || m.address) {
    const start = String(m.eventStartDate ?? '');
    const end = String(m.eventEndDate ?? '');
    const addr = String(m.address ?? '');
    const region = addr.split(' ').slice(0, 2).join(' ') || '전국';
    return {
      post,
      region,
      startDate: start,
      endDate: end,
      fee: null,
      genre: null,
      place: addr,
      status: start && end ? getStatus(start, end) : 'ongoing',
    };
  }

  return null;
}

const STATUS_ORDER = { ongoing: 0, upcoming: 1, ended: 2 };
const STATUS_STYLES: Record<string, string> = {
  ongoing: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  upcoming: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  ended: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
};
const STATUS_LABELS: Record<string, string> = { ongoing: '진행중', upcoming: '예정', ended: '종료' };

export const FestivalEventList: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const events = useMemo(() => {
    const normalized = posts
      .map(normalize)
      .filter((e): e is NormalizedEvent => e !== null);
    return normalized.sort((a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      || a.startDate.localeCompare(b.startDate),
    );
  }, [posts]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      if (e.region) set.add(e.region);
    }
    return [...set].sort();
  }, [events]);

  const [regionFilter, setRegionFilter] = useState<string | undefined>(undefined);
  const [freeOnly, setFreeOnly] = useState(false);

  const filtered = useMemo(() =>
    events.filter(e => {
      if (regionFilter && e.region !== regionFilter) return false;
      if (freeOnly && e.fee !== '무료') return false;
      return true;
    }),
    [events, regionFilter, freeOnly],
  );

  if (events.length === 0) return null;

  const hasFreeEvents = events.some(e => e.fee === '무료');

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
          축제/행사 <span className="font-normal text-slate-400">({events.length})</span>
        </h3>
        {hasFreeEvents && (
          <button
            onClick={() => setFreeOnly(prev => !prev)}
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
              freeOnly
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}
          >
            무료만
          </button>
        )}
      </div>

      {regions.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
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
        {filtered.map(({ post, region, startDate, endDate, fee, genre, place, status }) => {
          const period = startDate && endDate
            ? `${formatYmd(startDate)} ~ ${formatYmd(endDate)}`
            : startDate ? formatYmd(startDate) : null;

          return (
            <a
              key={post.id}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 bg-white dark:bg-slate-800 px-4 py-3 rounded-lg hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors"
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
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                  {post.title}
                </h4>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLES[status]}`}>
                    {STATUS_LABELS[status]}
                  </span>
                  {region && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                      {region}
                    </span>
                  )}
                  {fee === '무료' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                      무료
                    </span>
                  )}
                  {genre && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                      {genre}
                    </span>
                  )}
                </div>
                {period && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{period}</p>
                )}
                {place && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{place}</p>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
};
