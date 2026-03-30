import React, { useState } from 'react';
import { useTrendSignals } from '../hooks/usePosts';
import type { TrendSignal, GoogleArticle, RelatedPost } from '../types';
import { ErrorRetry } from './shared/ErrorRetry';

function trendIcon(changePct: number | null): string {
  if (changePct === null) return '';
  if (changePct > 10) return '🔥';
  if (changePct > 0) return '📈';
  if (changePct < -10) return '📉';
  if (changePct < 0) return '↘️';
  return '➡️';
}

function changeLabel(changePct: number | null): string {
  if (changePct === null) return '';
  return changePct > 0 ? `+${changePct}%` : `${changePct}%`;
}

// ── 미니 스파크라인 (SVG) ─────────────────────────────

const Sparkline: React.FC<{ data: { ratio: number }[]; className?: string }> = ({ data, className }) => {
  if (data.length < 2) return null;

  const width = 72;
  const height = 20;
  const padding = 2;

  const ratios = data.map(d => d.ratio);
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  const range = max - min || 1;

  const points = ratios
    .map((r, i) => {
      const x = padding + (i / (ratios.length - 1)) * (width - padding * 2);
      const y = height - padding - ((r - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  // 마지막 값이 첫 값보다 높으면 상승색, 아니면 하락색
  const isUp = ratios[ratios.length - 1] >= ratios[0];
  const color = isUp ? '#f59e0b' : '#94a3b8';

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 마지막 점 강조 */}
      <circle
        cx={padding + ((ratios.length - 1) / (ratios.length - 1)) * (width - padding * 2)}
        cy={height - padding - ((ratios[ratios.length - 1] - min) / range) * (height - padding * 2)}
        r="2"
        fill={color}
      />
    </svg>
  );
};

// ── 기사 아이템 (google_articles + related_posts 공용) ──

interface ArticleItem {
  title: string;
  url: string;
  source: string;
}

function mergeArticles(googleArticles: GoogleArticle[], relatedPosts: RelatedPost[]): ArticleItem[] {
  const seen = new Set<string>();
  const items: ArticleItem[] = [];

  for (const a of googleArticles) {
    if (!seen.has(a.url)) {
      seen.add(a.url);
      items.push({ title: a.title, url: a.url, source: a.source });
    }
  }
  for (const p of relatedPosts) {
    if (!seen.has(p.url)) {
      seen.add(p.url);
      items.push({ title: p.title, url: p.url, source: p.source_name });
    }
  }

  return items.slice(0, 5);
}

const ArticleRow: React.FC<{ item: ArticleItem }> = ({ item }) => (
  <a
    href={item.url}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-start gap-2 py-1.5 px-1 rounded hover:bg-slate-100 transition-colors group/article"
  >
    <span className="text-xs text-slate-400 mt-0.5 shrink-0">📰</span>
    <span className="text-xs text-slate-700 group-hover/article:text-blue-600 line-clamp-1 flex-1">
      {item.title}
    </span>
    <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
      {item.source}
    </span>
  </a>
);

// ── 시그널 카드 ──────────────────────────────────────

const SignalCard: React.FC<{
  signal: TrendSignal;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ signal, rank, isExpanded, onToggle }) => {
  const isConfirmed = signal.signal_type === 'confirmed';
  const hasNaver = signal.naver_change_pct !== null;
  const hasCommunity = signal.community_mentions > 0;

  const borderClass = isConfirmed
    ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50'
    : 'border-blue-200 bg-gradient-to-br from-blue-50 to-slate-50';

  const hoverBorderClass = isConfirmed
    ? 'hover:border-amber-400 hover:shadow-amber-100'
    : 'hover:border-blue-300 hover:shadow-blue-100';

  const articles = mergeArticles(signal.google_articles ?? [], signal.related_posts ?? []);
  const hasArticles = articles.length > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={hasArticles ? onToggle : undefined}
      onKeyDown={hasArticles ? (e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); } : undefined}
      className={`flex-shrink-0 w-56 p-3 rounded-xl border-2 ${borderClass} ${hoverBorderClass} hover:shadow-md transition-all ${hasArticles ? 'cursor-pointer' : ''} ${isExpanded ? 'w-72' : ''}`}
    >
      {/* 상단: 랭크 + 검증 뱃지 + 스파크라인 */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${isConfirmed ? 'text-amber-600' : 'text-blue-500'}`}>
            #{rank}
          </span>
          <div className="flex gap-0.5">
            <span className="text-xs" title="Google 트렌드">
              {isConfirmed ? '✅' : '🔍'}
            </span>
            <span className="text-xs" title="Naver DataLab">
              {hasNaver ? '✅' : '⬜'}
            </span>
            <span className="text-xs" title="커뮤니티 언급">
              {hasCommunity ? '✅' : '⬜'}
            </span>
          </div>
        </div>
        {signal.naver_trend_data && signal.naver_trend_data.length >= 2 && (
          <Sparkline data={signal.naver_trend_data} />
        )}
      </div>

      {/* 키워드 */}
      <p className={`text-sm font-semibold mb-0.5 truncate ${isConfirmed ? 'text-amber-900' : 'text-slate-800'}`}>
        {signal.keyword}
      </p>

      {/* 대표 뉴스 제목 1줄 */}
      {signal.context_title && (
        <p className="text-[11px] text-slate-500 mb-1.5 line-clamp-1" title={signal.context_title}>
          {signal.context_title}
        </p>
      )}

      {/* 메트릭스 */}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
        {signal.google_traffic && (
          <span>🔍 {signal.google_traffic}</span>
        )}
        {hasNaver && (
          <span>{trendIcon(signal.naver_change_pct)} {changeLabel(signal.naver_change_pct)}</span>
        )}
        {hasCommunity && (
          <span>💬 {signal.community_mentions}곳</span>
        )}
      </div>

      {/* 시그널 타입 라벨 */}
      <div className="mt-1.5 flex items-center gap-1.5">
        {isConfirmed ? (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800">
            확인된 트렌드
          </span>
        ) : (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
            Google 트렌드
          </span>
        )}
        {hasArticles && (
          <span className="text-[10px] text-slate-400">
            {isExpanded ? '▲' : `▼ ${articles.length}건`}
          </span>
        )}
      </div>

      {/* 펼친 상태: 추가 기사 목록 */}
      {isExpanded && articles.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-200/60 space-y-0">
          {articles.map((item, i) => (
            <ArticleRow key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export const TrendRadar: React.FC = () => {
  const { data, isLoading, error, refetch } = useTrendSignals();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 mb-3">🎯 교차 검증 트렌드</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex-shrink-0 w-56 h-28 bg-white rounded-xl border-2 border-slate-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 mb-3">🎯 교차 검증 트렌드</h2>
        <ErrorRetry message="트렌드 신호를 불러오지 못했습니다." onRetry={refetch} />
      </div>
    );
  }

  const signals = data?.signals ?? [];
  if (signals.length === 0) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 mb-3">🎯 교차 검증 트렌드</h2>
        <div className="border-2 border-dashed border-slate-200 rounded-xl py-8 text-center">
          <p className="text-sm text-slate-400">트렌드 데이터를 수집 중입니다</p>
          <p className="text-xs text-slate-300 mt-1">잠시 후 자동으로 표시됩니다</p>
        </div>
      </div>
    );
  }

  const confirmed = signals.filter(s => s.signal_type === 'confirmed');
  const googleOnly = signals.filter(s => s.signal_type === 'google_only');
  const sorted = [...confirmed, ...googleOnly];

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-500">🎯 교차 검증 트렌드</h2>
        {confirmed.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            {confirmed.length}개 확인됨
          </span>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {sorted.slice(0, 15).map((signal, i) => (
          <SignalCard
            key={signal.id}
            signal={signal}
            rank={i + 1}
            isExpanded={expandedId === signal.id}
            onToggle={() => setExpandedId(prev => prev === signal.id ? null : signal.id)}
          />
        ))}
      </div>
    </div>
  );
};
