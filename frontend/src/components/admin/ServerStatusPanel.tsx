import type { HealthResponse } from '../../api/admin';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function PoolBar({ label, stats }: { label: string; stats: { total: number; idle: number; waiting: number } }) {
  const active = stats.total - stats.idle;
  const pct = stats.total > 0 ? Math.round((active / stats.total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-slate-600 dark:text-slate-300 font-mono">{active}/{stats.total} active{stats.waiting > 0 ? `, ${stats.waiting} waiting` : ''}</span>
      </div>
      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ServerStatusPanel({ health }: { health: HealthResponse }) {
  const { pool, memory, uptime_seconds, embedding_cache_size } = health;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">서버 상태</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Uptime */}
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">업타임</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 font-mono">
            {uptime_seconds != null ? formatUptime(uptime_seconds) : '-'}
          </p>
        </div>

        {/* Memory */}
        {memory && (
          <>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Heap 사용량</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100 font-mono">
                {memory.heap_used_mb} <span className="text-xs font-normal text-slate-400">/ {memory.heap_total_mb} MB</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">RSS</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100 font-mono">{memory.rss_mb} MB</p>
            </div>
          </>
        )}

        {/* Embedding Cache */}
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">임베딩 캐시</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 font-mono">
            {embedding_cache_size ?? '-'}
          </p>
        </div>
      </div>

      {/* Connection Pools */}
      {pool && (
        <div className="space-y-2">
          <PoolBar label="API Pool" stats={pool.api} />
          <PoolBar label="Batch Pool" stats={pool.batch} />
        </div>
      )}
    </div>
  );
}
