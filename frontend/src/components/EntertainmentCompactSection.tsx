import React, { useMemo } from 'react';
import type { Post } from '../types';
import type { EntertainmentSub } from './EntertainmentSubTabs';
import { RankBadge } from './shared/RankBadge';

const TOP_N = 5;

interface CompactItem {
  rank: number;
  title: string;
  subtitle: string;
  url: string;
}

function extractCompactItems(category: string, posts: Post[]): CompactItem[] {
  const items: CompactItem[] = [];

  for (const post of posts) {
    const m = post.metadata as Record<string, unknown> | undefined;
    if (!m) continue;

    switch (category) {
      case 'movie':
        if (m.movieName && typeof m.rank === 'number') {
          const daily = typeof m.dailyAudience === 'number' ? `일 ${m.dailyAudience.toLocaleString()}명` : '';
          items.push({ rank: m.rank as number, title: m.movieName as string, subtitle: daily, url: post.url });
        }
        break;
      case 'music':
        if (m.title && m.artist && typeof m.rank === 'number') {
          items.push({ rank: m.rank as number, title: m.title as string, subtitle: m.artist as string, url: post.url });
        }
        break;
      case 'performance':
        if (m.performanceName && typeof m.rank === 'number') {
          items.push({ rank: m.rank as number, title: m.performanceName as string, subtitle: (m.venue as string) ?? '', url: post.url });
        }
        break;
      case 'books':
        if (m.title && typeof m.rank === 'number') {
          items.push({ rank: m.rank as number, title: m.title as string, subtitle: (m.author as string) ?? '', url: post.url });
        }
        break;
      case 'ott':
        if (m.title && typeof m.rank === 'number') {
          items.push({ rank: m.rank as number, title: m.title as string, subtitle: (m.platform as string) ?? '', url: post.url });
        }
        break;
    }
  }

  return items.sort((a, b) => a.rank - b.rank).slice(0, TOP_N);
}

const SECTION_CONFIG: Record<string, { icon: string; label: string; sub: EntertainmentSub }> = {
  movie:       { icon: '🎬', label: '영화 박스오피스',   sub: 'movie' },
  music:       { icon: '🎵', label: '음악 차트',        sub: 'music' },
  performance: { icon: '🎭', label: '공연 예매순위',     sub: 'performance' },
  books:       { icon: '📚', label: '도서 베스트셀러',   sub: 'books' },
  ott:         { icon: '📺', label: 'OTT TOP 10',      sub: 'ott' },
};

interface Props {
  category: string;
  posts: Post[];
  onSubTabChange: (sub: EntertainmentSub) => void;
}

export const EntertainmentCompactSection: React.FC<Props> = ({ category, posts, onSubTabChange }) => {
  const config = SECTION_CONFIG[category];
  const items = useMemo(() => extractCompactItems(category, posts), [category, posts]);

  if (!config || items.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
          {config.icon} {config.label}
        </h3>
        <button
          onClick={() => onSubTabChange(config.sub)}
          className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-medium transition-colors"
        >
          더보기 →
        </button>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
        {items.map(item => (
          <a
            key={`${category}-${item.rank}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <RankBadge rank={item.rank} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">
                {item.title}
              </span>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 max-w-[120px] truncate">
              {item.subtitle}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
};
