import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { notifyPipelineWarning } from './discord.js';
import { getSummaryMetrics } from './geminiSummarizer.js';

interface HealthProblem {
  readonly code: string;
  readonly detail: string;
}

/**
 * 파이프라인 실행 직후 호출 — 사용자에게 노출되는 "전체" 탭 데이터 건강성 점검.
 * 문제 감지 시 Discord 경보 발송(최대 1건/호출, 중복 최소화).
 */
export async function checkPipelineHealth(pool: Pool): Promise<void> {
  const problems: HealthProblem[] = [];

  const { rows: freshRows } = await pool.query<{ calculated_at: Date | null; age_sec: number | null }>(
    `SELECT MAX(calculated_at) AS calculated_at,
            EXTRACT(EPOCH FROM (NOW() - MAX(calculated_at)))::int AS age_sec
       FROM issue_rankings WHERE expires_at > NOW()`,
  );
  const ageSec = freshRows[0]?.age_sec ?? null;
  if (ageSec == null) {
    problems.push({ code: 'no_rankings', detail: 'issue_rankings에 활성 행이 없음' });
  } else if (ageSec > 20 * 60) {
    problems.push({ code: 'stale_rankings', detail: `MAX(calculated_at) ${ageSec}s ago (>20min)` });
  }

  const { rows: nullRows } = await pool.query<{ window_hours: number; total: number; nulls: number }>(
    `SELECT window_hours,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE summary IS NULL OR summary LIKE '[fallback]%')::int AS nulls
       FROM issue_rankings
      WHERE expires_at > NOW()
      GROUP BY window_hours`,
  );
  for (const r of nullRows) {
    if (r.total === 0) continue;
    const ratio = r.nulls / r.total;
    if (ratio > 0.3) {
      problems.push({
        code: 'null_summary',
        detail: `window=${r.window_hours}h null/fallback ratio ${(ratio * 100).toFixed(0)}% (${r.nulls}/${r.total})`,
      });
    }
  }

  const { rows: matRows } = await pool.query<{ window_hours: number; cnt: number }>(
    `SELECT window_hours, COUNT(*)::int AS cnt
       FROM issue_rankings_materialized
      GROUP BY window_hours`,
  );
  const windowsWithMat = new Set(matRows.map(r => r.window_hours));
  for (const w of [6, 12, 24]) {
    if (!windowsWithMat.has(w)) {
      problems.push({ code: 'empty_materialized', detail: `window=${w}h materialized 테이블에 행 없음` });
    }
  }

  // TD-006 (E): Gemini summary metrics from the most recent summarize tick
  const gm = getSummaryMetrics();
  logger.info(
    {
      calls: gm.calls,
      timeouts: gm.timeouts,
      cacheHits: gm.cacheHits,
      fallbacks: gm.fallbacks,
      avgLatencyMs: Math.round(gm.avgLatencyMs),
      hitRate: Number(gm.hitRate.toFixed(2)),
      fallbackRate: Number(gm.fallbackRate.toFixed(2)),
    },
    '[pipelineHealth] summary metrics',
  );

  // Skip noise on tiny tick windows (<5 processed items)
  if (gm.calls + gm.cacheHits + gm.fallbacks >= 5) {
    if (gm.hitRate < 0.3 && gm.cacheHits + gm.calls > 0) {
      problems.push({
        code: 'low_cache_hit_rate',
        detail: `summary cache hit ${(gm.hitRate * 100).toFixed(0)}% (<30%) — fingerprint churn?`,
      });
    }
    if (gm.timeouts > 5) {
      problems.push({
        code: 'gemini_timeouts',
        detail: `${gm.timeouts} Gemini timeouts in last tick (>5)`,
      });
    }
    if (gm.fallbackRate > 0.5) {
      problems.push({
        code: 'high_fallback_rate',
        detail: `summary fallback ${(gm.fallbackRate * 100).toFixed(0)}% (>50%)`,
      });
    }
  }

  if (problems.length === 0) {
    logger.info('[pipelineHealth] ok');
    return;
  }

  const msg = problems.map(p => `• [${p.code}] ${p.detail}`).join('\n');
  logger.warn({ problems }, '[pipelineHealth] issues detected');
  await notifyPipelineWarning('issue-pipeline-health', msg).catch(() => {});
}
