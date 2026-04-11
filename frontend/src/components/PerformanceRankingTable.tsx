import React, { useMemo, useState } from 'react';
import type { Post } from '../types';
import { RankBadge } from './shared/RankBadge';
import { DataFreshnessLabel } from './shared/DataFreshnessLabel';
import { ExternalLinkButton } from './shared/ExternalLinkButton';
import { PosterImage } from './shared/PosterImage';

interface PerformanceMeta {
  rank: number;
  genre: string;
  genreCode?: string;
  performanceName: string;
  venue: string;
  performanceId: string;
  posterUrl?: string;
  startDate?: string;
  endDate?: string;
  cast?: string;
  runtime?: string;
  priceInfo?: string;
  ticketUrl?: string;
  dataWeekStart?: string;
  dataWeekEnd?: string;
}

interface KcisaMeta {
  genre?: string;
  venue?: string;
  charge?: string;
  audience?: string;
  period?: string;
  eventPeriod?: string;
}

function isKopisPost(post: Post): boolean {
  return post.source_key === 'kopis_boxoffice';
}

function parsePerformanceMeta(post: Post): PerformanceMeta | null {
  const m = post.metadata as PerformanceMeta | undefined;
  if (m?.performanceName) return m;

  // Fallback: parse title "[뮤지컬] 공연명 — 공연장"
  const match = post.title.match(/^\[(.+?)\]\s+(.+?)\s+—\s+(.+)$/);
  if (!match) return null;

  return {
    rank: 0, // 실제 rank는 배열 인덱스 기반으로 외부에서 재할당
    genre: match[1],
    performanceName: match[2],
    venue: match[3],
    performanceId: '',
  };
}

const GENRE_ICONS: Record<string, string> = {
  '뮤지컬': '🎵',
  '연극': '🎭',
  '대공연(콘서트)': '🎤',
  '클래식': '🎻',
  '무용': '💃',
  '전시': '🖼️',
};

const GENRE_ORDER = ['뮤지컬', '연극', '대공연(콘서트)', '클래식', '무용'];

function genreIcon(genre: string): string {
  return GENRE_ICONS[genre] ?? '🎭';
}

function formatDate(raw?: string): string {
  if (!raw) return '';
  if (raw.length === 8) return raw.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3');
  return raw;
}

function interparkSearchUrl(name: string): string {
  return `https://tickets.interpark.com/search?keyword=${encodeURIComponent(name)}`;
}

// ── KOPIS 장르별 랭킹 섹션 ──

function GenreSection({ genre, items }: { genre: string; items: { post: Post; meta: PerformanceMeta }[] }) {
  const icon = genreIcon(genre);
  const sorted = [...items].sort((a, b) => a.meta.rank - b.meta.rank);

  return (
    <div className="mb-2 last:mb-0">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-4 py-2 bg-slate-50/70 dark:bg-slate-900/70 border-b border-slate-100 dark:border-slate-700">
        {icon} {genre}
      </h3>

      {/* Desktop table */}
      <table className="w-full hidden sm:table">
        <thead>
          <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
            <th className="py-2 px-3 text-center w-14">순위</th>
            <th className="py-2 px-2 w-14"></th>
            <th className="py-2 px-3 text-left">공연명</th>
            <th className="py-2 px-3 text-left w-36">공연장</th>
            <th className="py-2 px-3 text-center w-32">기간</th>
            <th className="py-2 px-3 text-center w-24">예매</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ post, meta }) => (
            <tr key={post.id} className="border-b border-slate-50 dark:border-slate-700 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors">
              <td className="py-3 px-3 text-center">
                <RankBadge rank={meta.rank} />
              </td>
              <td className="py-3 px-2">
                <PosterImage
                  src={meta.posterUrl || post.thumbnail}
                  alt={meta.performanceName}
                  width={40}
                  height={56}
                  fallbackIcon={icon}
                />
              </td>
              <td className="py-3 px-3">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 transition-colors"
                >
                  {meta.performanceName}
                </a>
                {meta.cast && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{meta.cast}</p>
                )}
              </td>
              <td className="py-3 px-3 text-sm text-slate-500 dark:text-slate-400">{meta.venue}</td>
              <td className="py-3 px-3 text-center">
                {meta.startDate && meta.endDate ? (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(meta.startDate)} ~ {formatDate(meta.endDate)}
                  </span>
                ) : (
                  <span className="text-xs text-slate-300 dark:text-slate-600">-</span>
                )}
              </td>
              <td className="py-3 px-3 text-center">
                <ExternalLinkButton
                  href={meta.ticketUrl || interparkSearchUrl(meta.performanceName)}
                  label="예매"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile list */}
      <div className="sm:hidden divide-y divide-slate-50 dark:divide-slate-700">
        {sorted.map(({ post, meta }) => (
          <div key={post.id} className="flex items-start gap-3 px-4 py-3">
            <RankBadge rank={meta.rank} />
            <PosterImage
              src={meta.posterUrl || post.thumbnail}
              alt={meta.performanceName}
              width={36}
              height={50}
              fallbackIcon={icon}
            />
            <div className="flex-1 min-w-0">
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 transition-colors line-clamp-1"
              >
                {meta.performanceName}
              </a>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{meta.venue}</p>
              {meta.startDate && meta.endDate && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {formatDate(meta.startDate)} ~ {formatDate(meta.endDate)}
                </p>
              )}
              <div className="mt-1.5">
                <ExternalLinkButton
                  href={meta.ticketUrl || interparkSearchUrl(meta.performanceName)}
                  label="예매하기"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KCISA 기타 공연/전시 섹션 ──

function KcisaSection({ label, icon, posts }: { label: string; icon: string; posts: Post[] }) {
  if (posts.length === 0) return null;

  return (
    <div className="mb-2 last:mb-0">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-4 py-2 bg-slate-50/70 dark:bg-slate-900/70 border-b border-slate-100 dark:border-slate-700">
        {icon} {label}
      </h3>
      <div className="divide-y divide-slate-50 dark:divide-slate-700">
        {posts.map(post => {
          const m = post.metadata as KcisaMeta | undefined;
          // Parse title: "[genre] name — venue" or "[전시] name — venue"
          const titleMatch = post.title.match(/^\[(.+?)\]\s+(.+?)(?:\s+—\s+(.+))?$/);
          const name = titleMatch ? titleMatch[2] : post.title;
          const venue = m?.venue || titleMatch?.[3] || '';

          return (
            <a
              key={post.id}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 px-4 py-3 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors"
            >
              {post.thumbnail && (
                <PosterImage src={post.thumbnail} alt={name} width={36} height={50} fallbackIcon={icon} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">{name}</p>
                {venue && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{venue}</p>}
                {m?.period && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">{m.period}</p>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──

type ViewMode = 'all' | 'ranking' | 'exhibition' | 'event';

export const PerformanceRankingTable: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // KOPIS 랭킹 데이터
  const kopisPerformances = useMemo(() =>
    posts
      .filter(isKopisPost)
      .map(p => ({ post: p, meta: parsePerformanceMeta(p) }))
      .filter((m): m is { post: Post; meta: PerformanceMeta } => m.meta !== null),
    [posts]
  );

  // KCISA 공연/전시 데이터 (비랭킹)
  const kcisaExhibitions = useMemo(() =>
    posts.filter(p => p.source_key === 'kcisa_cca_exhibition'),
    [posts]
  );

  const kcisaOtherPerformances = useMemo(() =>
    posts.filter(p =>
      !isKopisPost(p)
      && p.source_key !== 'kcisa_cca_exhibition'
      && p.category === 'performance'
    ),
    [posts]
  );

  // KOPIS 중복 제거: 동일 공연명+공연장 조합
  const dedupedKopis = useMemo(() => {
    const seen = new Set<string>();
    return kopisPerformances.filter(({ meta }) => {
      const key = `${meta.performanceName}|${meta.venue}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [kopisPerformances]);

  // 장르 목록 (KOPIS)
  const genres = useMemo(() => {
    const genreSet = new Set(dedupedKopis.map(p => p.meta.genre));
    return [...genreSet].sort((a, b) => {
      const ai = GENRE_ORDER.indexOf(a);
      const bi = GENRE_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [dedupedKopis]);

  const filteredGenres = selectedGenre === 'all'
    ? genres
    : genres.filter(g => g === selectedGenre);

  if (posts.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">공연/전시 데이터가 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  // Genre group map (KOPIS)
  const genreMap = new Map<string, { post: Post; meta: PerformanceMeta }[]>();
  for (const item of dedupedKopis) {
    const arr = genreMap.get(item.meta.genre);
    if (arr) arr.push(item);
    else genreMap.set(item.meta.genre, [item]);
  }

  const hasKopis = dedupedKopis.length > 0;
  const hasExhibition = kcisaExhibitions.length > 0;
  const hasOther = kcisaOtherPerformances.length > 0;

  return (
    <div className="bg-white dark:bg-slate-800 overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">공연·전시</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">KOPIS 예매순위 + 문화정보</p>
          </div>
          <DataFreshnessLabel label="이번 주 기준 (주간)" />
        </div>

        {/* 뷰 모드 토글 */}
        {(hasExhibition || hasOther) && (
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => setViewMode('all')}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                viewMode === 'all' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              전체
            </button>
            {hasKopis && (
              <button
                onClick={() => setViewMode('ranking')}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'ranking' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
              >
                🎭 예매순위
              </button>
            )}
            {hasExhibition && (
              <button
                onClick={() => setViewMode('exhibition')}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'exhibition' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
              >
                🖼️ 전시
              </button>
            )}
            {hasOther && (
              <button
                onClick={() => setViewMode('event')}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'event' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
              >
                🎪 공연·행사
              </button>
            )}
          </div>
        )}

        {/* KOPIS 장르 필터 (예매순위 모드에서만) */}
        {(viewMode === 'all' || viewMode === 'ranking') && hasKopis && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-hide pb-0.5">
            <button
              onClick={() => setSelectedGenre('all')}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                selectedGenre === 'all' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              전체 장르
            </button>
            {genres.map(genre => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                  selectedGenre === genre ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {genreIcon(genre)} {genre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KOPIS 예매순위 */}
      {(viewMode === 'all' || viewMode === 'ranking') && filteredGenres.map(genre => {
        const items = genreMap.get(genre);
        if (!items) return null;
        return <GenreSection key={genre} genre={genre} items={items} />;
      })}

      {/* KCISA 전시 */}
      {(viewMode === 'all' || viewMode === 'exhibition') && (
        <KcisaSection label="전시" icon="🖼️" posts={kcisaExhibitions} />
      )}

      {/* KCISA 기타 공연/행사 */}
      {(viewMode === 'all' || viewMode === 'event') && (
        <KcisaSection label="공연·행사" icon="🎪" posts={kcisaOtherPerformances} />
      )}
    </div>
  );
};
