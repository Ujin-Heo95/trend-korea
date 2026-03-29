import React from 'react';
import { useTrendSignals } from '../hooks/usePosts';
import type { TrendSignal } from '../types';

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

function googleSearchUrl(keyword: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;
}

function naverDatalabUrl(keyword: string): string {
  return `https://datalab.naver.com/keyword/trendSearch.naver?keyword=${encodeURIComponent(keyword)}`;
}

const SignalCard: React.FC<{ signal: TrendSignal; rank: number }> = ({ signal, rank }) => {
  const isConfirmed = signal.signal_type === 'confirmed';
  const hasNaver = signal.naver_change_pct !== null;
  const hasCommunity = signal.community_mentions > 0;

  const borderClass = isConfirmed
    ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50'
    : 'border-blue-200 bg-gradient-to-br from-blue-50 to-slate-50';

  const hoverBorderClass = isConfirmed
    ? 'hover:border-amber-400 hover:shadow-amber-100'
    : 'hover:border-blue-300 hover:shadow-blue-100';

  return (
    <a
      href={hasNaver ? naverDatalabUrl(signal.keyword) : googleSearchUrl(signal.keyword)}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex-shrink-0 w-56 p-3 rounded-xl border-2 ${borderClass} ${hoverBorderClass} hover:shadow-md transition-all group`}
    >
      {/* 상단: 랭크 + 검증 뱃지 */}
      <div className="flex items-center justify-between mb-2">
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

      {/* 키워드 */}
      <p className={`text-sm font-semibold mb-1.5 truncate ${isConfirmed ? 'text-amber-900 group-hover:text-amber-700' : 'text-slate-800 group-hover:text-blue-600'}`}>
        {signal.keyword}
      </p>

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
      <div className="mt-2">
        {isConfirmed ? (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800">
            확인된 트렌드
          </span>
        ) : (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
            Google 트렌드
          </span>
        )}
      </div>
    </a>
  );
};

export const TrendRadar: React.FC = () => {
  const { data, isLoading } = useTrendSignals();

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

  const signals = data?.signals ?? [];
  if (signals.length === 0) return null;

  const confirmed = signals.filter(s => s.signal_type === 'confirmed');
  const googleOnly = signals.filter(s => s.signal_type === 'google_only');

  // 확인된 트렌드 먼저, 그 다음 Google Only
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
          <SignalCard key={signal.id} signal={signal} rank={i + 1} />
        ))}
      </div>
    </div>
  );
};
