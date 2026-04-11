import React, { useState } from 'react';
import { useAdminToken, useAdminHealth } from '../hooks/useAdminHealth';
import { useScraperStatus, useToggleSource, useTriggerScraper } from '../hooks/useScraperControl';
import { ScoringConfigPanel } from '../components/admin/ScoringConfigPanel';
import { MonitoringTab } from '../components/admin/MonitoringTab';
import { ServerStatusPanel } from '../components/admin/ServerStatusPanel';
import { FeatureFlagPanel } from '../components/admin/FeatureFlagPanel';
import { SourceTable } from '../components/admin/SourceTable';

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 전`;
  return `${Math.floor(diffMin / 1440)}일 전`;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ?? 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function TokenGate({ onSubmit, error }: { onSubmit: (t: string) => void; error?: boolean }) {
  const [input, setInput] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <form onSubmit={e => { e.preventDefault(); if (input.trim()) onSubmit(input.trim()); }}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">WeekLit Admin</h1>
        {error && <p className="text-sm text-red-500">인증 실패 — 토큰을 확인하세요</p>}
        <input type="password" value={input} onChange={e => setInput(e.target.value)} placeholder="ADMIN_TOKEN"
          className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus />
        <button type="submit" className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">로그인</button>
      </form>
    </div>
  );
}

type AdminTab = 'dashboard' | 'monitoring' | 'config';

export function AdminPage() {
  const { token, setToken, clearToken } = useAdminToken();
  const { data, isLoading, isError, error, isAuthed, refetch } = useAdminHealth(token);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const hash = window.location.hash.replace('#', '') as AdminTab;
    return hash === 'config' ? 'config' : hash === 'monitoring' ? 'monitoring' : 'dashboard';
  });

  const scraperQuery = useScraperStatus(activeTab === 'dashboard' ? token : null);
  const toggleMutation = useToggleSource(token ?? '');
  const runMutation = useTriggerScraper(token ?? '');

  React.useEffect(() => { window.location.hash = activeTab; }, [activeTab]);
  React.useEffect(() => { if (data) setLastRefresh(Date.now()); }, [data]);

  if (!token || isAuthed === false) return <TokenGate onSubmit={setToken} error={isAuthed === false} />;

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
            <button onClick={() => refetch()} className="px-4 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">재시도</button>
            <button onClick={clearToken} className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">로그아웃</button>
          </div>
        </div>
      </div>
    );
  }

  const { health, sources } = data;
  const secAgo = Math.floor((Date.now() - lastRefresh) / 1000);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">WeekLit Admin</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            health.status === 'ok'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          }`}>{health.status}</span>
          <div className="flex gap-1 ml-4">
            {(['dashboard', 'monitoring', 'config'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}>{tab === 'dashboard' ? '대시보드' : tab === 'monitoring' ? '모니터링' : '스코어링 설정'}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>{secAgo < 5 ? '방금 갱신' : `${secAgo}초 전 갱신`} (30초 주기)</span>
          <button onClick={clearToken} className="text-red-400 hover:text-red-500 transition-colors">로그아웃</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {activeTab === 'config' && token ? (
          <ScoringConfigPanel token={token} />
        ) : activeTab === 'monitoring' ? (
          <MonitoringTab />
        ) : (
          <>
            {/* System Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="DB 크기" value={`${health.db.db_size_mb} MB`} sub="Supabase Pro 8GB" />
              <StatCard label="총 포스트" value={health.db.post_count.toLocaleString()} sub={`최고령 ${health.db.oldest_post_age_days.toFixed(1)}일`} />
              <StatCard label="활성 스크래퍼" value={health.scrapers.total} sub={`마지막 실행 ${formatTime(health.scrapers.last_run_at)}`} />
              <StatCard label="실패 스크래퍼" value={health.scrapers.failed_last_run}
                color={health.scrapers.failed_last_run > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'} />
            </div>

            {/* Server Status (pool, memory, uptime, cache) */}
            <ServerStatusPanel health={health} />

            {/* Feature Flags */}
            {health.feature_flags && token && (
              <FeatureFlagPanel flags={health.feature_flags} token={token} />
            )}

            {/* API Keys */}
            {health.api_keys.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">API 키 상태</h2>
                <div className="flex flex-wrap gap-2">
                  {health.api_keys.map(k => (
                    <span key={k.key} title={k.error ?? (k.valid ? '유효' : '미확인')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                        k.valid === true ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : k.valid === false ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${k.valid === true ? 'bg-emerald-500' : k.valid === false ? 'bg-red-500' : 'bg-slate-400'}`} />
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
                          <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 w-24 text-right">{q.used} / {limit}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Scraper Status Error */}
            {scraperQuery.isError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center justify-between">
                <p className="text-sm text-red-600 dark:text-red-400">
                  스크래퍼 상태 조회 실패: {scraperQuery.error instanceof Error ? scraperQuery.error.message : '알 수 없는 오류'}
                </p>
                <button onClick={() => scraperQuery.refetch()} className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-medium hover:opacity-80 transition-colors">재시도</button>
              </div>
            )}

            {/* Source Table */}
            <SourceTable
              sources={sources}
              scraperStatus={scraperQuery.data}
              onToggle={(key, enabled) => toggleMutation.mutate({ sourceKey: key, enabled })}
              onRun={(key) => runMutation.mutate(key)}
              isToggling={toggleMutation.isPending}
              runningKey={runMutation.isPending ? (runMutation.variables as string) : null}
            />
          </>
        )}
      </main>
    </div>
  );
}
