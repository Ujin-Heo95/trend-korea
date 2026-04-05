import React, { useState, useMemo } from 'react';
import { useAdminToken, useAdminHealth, type MergedSource } from '../hooks/useAdminHealth';

type SortKey = 'name' | 'category' | 'successRate' | 'lastRunAt' | 'postCount' | 'lastPostCount';
type SortDir = 'asc' | 'desc';

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60_000);
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

// ─── Token Input ──────────────────────────────────────────────
function TokenGate({ onSubmit, error }: { onSubmit: (t: string) => void; error?: boolean }) {
  const [input, setInput] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <form
        onSubmit={e => { e.preventDefault(); if (input.trim()) onSubmit(input.trim()); }}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 w-full max-w-sm space-y-4"
      >
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">WeekLit Admin</h1>
        {error && <p className="text-sm text-red-500">인증 실패 — 토큰을 확인하세요</p>}
        <input
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="ADMIN_TOKEN"
          className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        <button
          type="submit"
          className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
        >
          로그인
        </button>
      </form>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ?? 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Source Table ──────────────────────────────────────────────
function SourceTable({ sources }: { sources: MergedSource[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'successRate', dir: 'asc' });
  const [filter, setFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');

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
    if (catFilter) {
      list = list.filter(s => s.category === catFilter);
    }
    return [...list].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
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
              <th className="px-3 py-3 text-left cursor-pointer select-none" onClick={() => toggleSort('name')}>소스{arrow('name')}</th>
              <th className="px-3 py-3 text-left cursor-pointer select-none" onClick={() => toggleSort('category')}>카테고리{arrow('category')}</th>
              <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('successRate')}>성공률{arrow('successRate')}</th>
              <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('lastRunAt')}>마지막 실행{arrow('lastRunAt')}</th>
              <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('lastPostCount')}>저장 건수{arrow('lastPostCount')}</th>
              <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('postCount')}>총 포스트{arrow('postCount')}</th>
              <th className="px-3 py-3 text-left">에러</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {sorted.map(src => (
              <tr key={src.key} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusDot(src)}`} />
                </td>
                <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200">
                  {src.name}
                  <span className="ml-1.5 text-xs text-slate-400">{src.key}</span>
                </td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{src.category}</td>
                <td className={`px-3 py-2.5 text-right font-mono ${rateColor(src.successRate)}`}>
                  {src.successRate !== null ? `${Math.round(src.successRate * 100)}%` : '-'}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-500 dark:text-slate-400">{formatTime(src.lastRunAt)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-300">
                  {src.lastPostCount ?? '-'}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-300">
                  {src.postCount.toLocaleString()}
                </td>
                <td className="px-3 py-2.5 max-w-[200px]">
                  {src.lastError ? (
                    <span className="text-xs text-red-500 truncate block" title={src.lastError}>
                      {src.lastError.slice(0, 60)}{src.lastError.length > 60 ? '...' : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────
export function AdminPage() {
  const { token, setToken, clearToken } = useAdminToken();
  const { data, isLoading, isError, error, isAuthed, refetch } = useAdminHealth(token);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // 데이터 갱신 시 타임스탬프 업데이트
  React.useEffect(() => {
    if (data) setLastRefresh(Date.now());
  }, [data]);

  // 토큰 없거나 인증 실패
  if (!token || isAuthed === false) {
    return <TokenGate onSubmit={setToken} error={isAuthed === false} />;
  }

  if (isLoading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <p className="text-slate-400 animate-pulse text-lg">데이터 로딩 중...</p>
      </div>
    );
  }

  if (isError || !data) {
    const msg = error instanceof Error ? error.message : '서버 연결 실패';
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">WeekLit Admin</h1>
          <p className="text-sm text-red-500">{msg}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => refetch()}
              className="px-4 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              재시도
            </button>
            <button
              onClick={clearToken}
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { health, sources } = data;
  const secAgo = Math.floor((Date.now() - lastRefresh) / 1000);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">WeekLit Admin</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            health.status === 'ok'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          }`}>
            {health.status}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>{secAgo < 5 ? '방금 갱신' : `${secAgo}초 전 갱신`} (30초 주기)</span>
          <button onClick={clearToken} className="text-red-400 hover:text-red-500 transition-colors">로그아웃</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* System Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="DB 크기" value={`${health.db.db_size_mb} MB`} sub="Supabase 500MB 한도" />
          <StatCard label="총 포스트" value={health.db.post_count.toLocaleString()} sub={`최고령 ${health.db.oldest_post_age_days.toFixed(1)}일`} />
          <StatCard
            label="활성 스크래퍼"
            value={health.scrapers.total}
            sub={`마지막 실행 ${formatTime(health.scrapers.last_run_at)}`}
          />
          <StatCard
            label="실패 스크래퍼"
            value={health.scrapers.failed_last_run}
            color={health.scrapers.failed_last_run > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}
          />
        </div>

        {/* API Keys */}
        {health.api_keys.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">API 키 상태</h2>
            <div className="flex flex-wrap gap-2">
              {health.api_keys.map(k => (
                <span
                  key={k.key}
                  title={k.error ?? (k.valid ? '유효' : '미확인')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                    k.valid === true
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : k.valid === false
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    k.valid === true ? 'bg-emerald-500' : k.valid === false ? 'bg-red-500' : 'bg-slate-400'
                  }`} />
                  {k.key}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* API Quota */}
        {health.api_quota && Object.keys(health.api_quota).length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">API 쿼터 (일일)</h2>
            <div className="space-y-2">
              {Object.entries(health.api_quota).map(([key, q]) => {
                const limit = key === 'gemini' ? 500 : key === 'youtube' ? 10000 : 1000;
                const pct = Math.min(100, Math.round((q.used / limit) * 100));
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-16">{key}</span>
                    <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 w-24 text-right">{q.used} / {limit}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Source Table */}
        <SourceTable sources={sources} />
      </main>
    </div>
  );
}
