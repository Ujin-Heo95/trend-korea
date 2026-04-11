import { useState, useMemo } from 'react';
import type { MergedSource } from '../../hooks/useAdminHealth';
import type { ScraperSourceStatus } from '../../api/adminScrapers';
import type { CircuitBreakerInfo } from '../../api/admin';
import { ErrorDetailModal } from './ErrorDetailModal';

type SortKey = 'name' | 'category' | 'successRate' | 'lastRunAt' | 'postCount' | 'lastPostCount';
type SortDir = 'asc' | 'desc';

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 전`;
  return `${Math.floor(diffMin / 1440)}일 전`;
}

function statusDot(src: MergedSource): string {
  if (src.lastError) return 'bg-red-500';
  if (src.successRate === null) return 'bg-slate-400';
  if (src.successRate >= 0.9) return 'bg-emerald-500';
  if (src.successRate >= 0.5) return 'bg-amber-500';
  return 'bg-red-500';
}

function rateColor(rate: number | null): string {
  if (rate === null) return 'text-slate-400';
  if (rate >= 0.9) return 'text-emerald-600 dark:text-emerald-400';
  if (rate >= 0.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function CbBadge({ cb }: { cb: CircuitBreakerInfo | null | undefined }) {
  if (!cb || (!cb.is_open && cb.failures === 0)) return null;
  if (cb.is_open) {
    const sec = Math.ceil(cb.cooldown_remaining_ms / 1000);
    const min = Math.floor(sec / 60);
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-mono">
        OPEN {min > 0 ? `${min}m` : `${sec}s`}
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 font-mono">
      {cb.failures}x fail
    </span>
  );
}

interface Props {
  sources: MergedSource[];
  scraperStatus?: ScraperSourceStatus[];
  onToggle?: (sourceKey: string, enabled: boolean) => void;
  onRun?: (sourceKey: string) => void;
  isToggling?: boolean;
  runningKey?: string | null;
}

export function SourceTable({ sources, scraperStatus, onToggle, onRun, isToggling, runningKey }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'successRate', dir: 'asc' });
  const [filter, setFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [errorModal, setErrorModal] = useState<{ key: string; error: string } | null>(null);

  const statusMap = useMemo(() => {
    const map = new Map<string, ScraperSourceStatus>();
    for (const s of scraperStatus ?? []) map.set(s.key, s);
    return map;
  }, [scraperStatus]);

  const categories = useMemo(() => {
    const cats = new Set(sources.map(s => s.category));
    return [...cats].sort();
  }, [sources]);

  const sorted = useMemo(() => {
    let list = sources;
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q));
    }
    if (catFilter) list = list.filter(s => s.category === catFilter);
    return [...list].sort((a, b) => {
      const va = a[sort.key]; const vb = b[sort.key];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [sources, sort, filter, catFilter]);

  const toggleSort = (key: SortKey) => {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };
  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-3">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="소스 검색..."
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 카테고리</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-xs text-slate-400 self-center ml-auto">{sorted.length}개 소스</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
              <tr>
                <th className="w-8 px-3 py-3"></th>
                {onToggle && <th className="px-2 py-3 text-center">활성</th>}
                <th className="px-3 py-3 text-left cursor-pointer select-none" onClick={() => toggleSort('name')}>소스{arrow('name')}</th>
                <th className="px-3 py-3 text-left cursor-pointer select-none" onClick={() => toggleSort('category')}>카테고리{arrow('category')}</th>
                <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('successRate')}>성공률{arrow('successRate')}</th>
                <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('lastRunAt')}>마지막 실행{arrow('lastRunAt')}</th>
                <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('lastPostCount')}>저장{arrow('lastPostCount')}</th>
                <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('postCount')}>총{arrow('postCount')}</th>
                <th className="px-3 py-3 text-left">CB</th>
                <th className="px-3 py-3 text-left">에러</th>
                {onRun && <th className="px-2 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {sorted.map(src => {
                const ss = statusMap.get(src.key);
                const cb = ss?.circuit_breaker ?? null;
                const effectiveEnabled = ss?.effective_enabled ?? true;

                return (
                  <tr key={src.key} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${!effectiveEnabled ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusDot(src)}`} />
                    </td>
                    {onToggle && (
                      <td className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => onToggle(src.key, !effectiveEnabled)}
                          disabled={isToggling}
                          className={`w-8 h-4 rounded-full relative transition-colors ${effectiveEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${effectiveEnabled ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200">
                      {src.name}
                      <span className="ml-1.5 text-xs text-slate-400">{src.key}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{src.category}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${rateColor(src.successRate)}`}>
                      {src.successRate !== null ? `${Math.round(src.successRate * 100)}%` : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500 dark:text-slate-400">{formatTime(src.lastRunAt)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-300">{src.lastPostCount ?? '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-300">{src.postCount.toLocaleString()}</td>
                    <td className="px-3 py-2.5"><CbBadge cb={cb} /></td>
                    <td className="px-3 py-2.5 max-w-[160px]">
                      {src.lastError ? (
                        <button
                          onClick={() => setErrorModal({ key: src.key, error: src.lastError! })}
                          className="text-xs text-red-500 truncate block text-left hover:underline max-w-full"
                        >
                          {src.lastError.slice(0, 50)}{src.lastError.length > 50 ? '...' : ''}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                    {onRun && (
                      <td className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => onRun(src.key)}
                          disabled={runningKey === src.key || (cb?.is_open ?? false)}
                          className="px-2 py-1 text-[10px] rounded bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-medium hover:opacity-80 disabled:opacity-40 transition-colors"
                        >
                          {runningKey === src.key ? '...' : '실행'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {errorModal && (
        <ErrorDetailModal
          sourceKey={errorModal.key}
          error={errorModal.error}
          onClose={() => setErrorModal(null)}
        />
      )}
    </>
  );
}
