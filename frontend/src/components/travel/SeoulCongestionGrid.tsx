import React, { useMemo } from 'react';
import type { Post } from '../../types';

interface CongestionMeta {
  area: string;
  congestionLevel: string;
  congestionMessage: string;
  populationMin: number;
  populationMax: number;
  measuredAt: string;
}

const LEVEL_STYLES: Record<string, string> = {
  '여유':     'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  '보통':     'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  '약간 붐빔': 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700',
  '붐빔':     'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700',
};

const LEVEL_DOT: Record<string, string> = {
  '여유':     'bg-emerald-500',
  '보통':     'bg-amber-500',
  '약간 붐빔': 'bg-orange-500',
  '붐빔':     'bg-red-500',
};

function formatPopulation(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return n.toLocaleString();
}

function formatTime(t: string): string {
  if (!t) return '';
  const match = t.match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : t;
}

function parseMeta(post: Post): CongestionMeta | null {
  const m = post.metadata as CongestionMeta | undefined;
  if (m?.area && m?.congestionLevel) return m;
  return null;
}

export const SeoulCongestionGrid: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const items = useMemo(() =>
    posts
      .filter(p => p.source_key === 'seoul_citydata')
      .map(p => ({ post: p, meta: parseMeta(p) }))
      .filter((v): v is { post: Post; meta: CongestionMeta } => v.meta !== null),
    [posts],
  );

  if (items.length === 0) return null;

  const measuredAt = formatTime(items[0]?.meta.measuredAt ?? '');

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
          서울 실시간 혼잡도
        </h3>
        {measuredAt && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {measuredAt} 기준
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {items.map(({ post, meta }) => {
          const style = LEVEL_STYLES[meta.congestionLevel] ?? LEVEL_STYLES['보통'];
          const dot = LEVEL_DOT[meta.congestionLevel] ?? LEVEL_DOT['보통'];

          return (
            <div
              key={post.id}
              className={`rounded-lg border px-3 py-2.5 ${style}`}
              title={meta.congestionMessage}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                <span className="text-sm font-bold truncate">{meta.area}</span>
              </div>
              <div className="text-[10px] font-medium opacity-80">
                {meta.congestionLevel}
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">
                약 {formatPopulation(meta.populationMin)}~{formatPopulation(meta.populationMax)}명
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
