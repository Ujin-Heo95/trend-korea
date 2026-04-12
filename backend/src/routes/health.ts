import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { checkApiKeys } from '../services/apiKeyHealth.js';
import { getQuotaStatus } from '../services/apiQuota.js';
import { isAdminRequest } from '../middleware/adminAuth.js';
import { pool, batchPool } from '../db/client.js';
import { getEmbeddingCacheSize } from '../services/embedding.js';
import { getFeatureFlags } from '../services/featureFlags.js';
import { getCircuitStates, CIRCUIT_BREAKER_COOLDOWN_MS } from '../scrapers/base.js';
import { ISSUE_DATA_SLO_SECONDS, getIssuesCacheTelemetry } from './issues.js';
import { getWatchdogStatus } from '../scheduler/watchdog.js';

async function readIssueDataAgeSeconds(app: FastifyInstance): Promise<number | null> {
  try {
    const { rows } = await app.pg.query<{ age_sec: number | null }>(
      `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(calculated_at)))::int AS age_sec
         FROM issue_rankings WHERE expires_at > NOW()`,
    );
    return rows[0]?.age_sec ?? null;
  } catch {
    return null;
  }
}

interface ScraperRunRow {
  source_key: string;
  last_run_at: string | null;
  last_post_count: number | null;
  last_error: string | null;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    const isAdmin = isAdminRequest(req);

    // 1. DB 연결 확인 — 비관리자 요청은 DB 없이도 200 반환 (healthcheck 통과용)
    let dbConnected = true;
    try {
      await app.pg.query('SELECT 1');
    } catch {
      dbConnected = false;
    }

    // 공개 응답: 서버 liveness 만. 항상 200 (DB 실패해도) — Fly machine healthcheck 가
    // 이 path 를 보고 critical 로 판단해 라우팅 차단하는 사고 회피. 데이터 신선도 SLO 신호는
    // 별도 엔드포인트 /health/freshness 에서 503 으로 노출 (UptimeRobot 등 외부 모니터 전용).
    if (!isAdmin) {
      const issueDataAgeSec = dbConnected ? await readIssueDataAgeSeconds(app) : null;
      const isStale = !dbConnected || issueDataAgeSec === null || issueDataAgeSec > ISSUE_DATA_SLO_SECONDS;
      return reply.status(200).send({
        status: dbConnected ? (isStale ? 'stale' : 'ok') : 'degraded',
        db: { connected: dbConnected },
        issue_data: {
          age_seconds: issueDataAgeSec,
          slo_seconds: ISSUE_DATA_SLO_SECONDS,
          is_stale: isStale,
        },
      });
    }

    if (!dbConnected) {
      return reply.status(503).send({
        status: 'degraded',
        db: { connected: false, post_count: 0, db_size_mb: 0, oldest_post_age_days: 0 },
        scrapers: { total: 0, last_run_at: null, failed_last_run: 0, sources: [] },
      });
    }

    // 인증된 요청: 상세 정보 반환
    const { rows: [dbStats] } = await app.pg.query<{
      post_count: number; db_size_mb: number; oldest_post_age_days: number;
    }>(`
      SELECT
        (SELECT COUNT(*)::int FROM posts)                              AS post_count,
        ROUND(pg_database_size(current_database()) / 1048576.0, 2)   AS db_size_mb,
        COALESCE(
          EXTRACT(EPOCH FROM (NOW() - MIN(scraped_at))) / 86400.0,
          0
        )::float                                                       AS oldest_post_age_days
      FROM posts
    `);

    const { rows: sources } = await app.pg.query<ScraperRunRow>(`
      SELECT DISTINCT ON (source_key)
        source_key,
        finished_at   AS last_run_at,
        posts_saved   AS last_post_count,
        error_message AS last_error
      FROM scraper_runs
      ORDER BY source_key, started_at DESC
    `);

    const lastRunAt = sources
      .map(s => s.last_run_at)
      .filter((t): t is string => t !== null)
      .sort().at(-1) ?? null;

    const failedLastRun = sources.filter(s => s.last_error !== null).length;

    const apiKeys = await checkApiKeys();
    const hasInvalidKey = apiKeys.some(k => k.valid === false);
    const issueDataAgeSec = await readIssueDataAgeSeconds(app);
    // null 도 stale 로 간주 (공개 응답과 동일 규칙)
    const issueIsStale = issueDataAgeSec === null || issueDataAgeSec > ISSUE_DATA_SLO_SECONDS;
    const cacheTelemetry = getIssuesCacheTelemetry();

    return reply.status(200).send({
      status: failedLastRun === 0 && !hasInvalidKey && !issueIsStale ? 'ok' : 'degraded',
      issue_data: {
        age_seconds: issueDataAgeSec,
        slo_seconds: ISSUE_DATA_SLO_SECONDS,
        is_stale: issueIsStale,
      },
      issues_cache: cacheTelemetry,
      watchdog: getWatchdogStatus(),
      db: {
        connected: true,
        post_count: dbStats.post_count ?? 0,
        db_size_mb: Number(dbStats.db_size_mb ?? 0),
        oldest_post_age_days: Number(dbStats.oldest_post_age_days ?? 0),
      },
      scrapers: {
        total: sources.length,
        last_run_at: lastRunAt,
        failed_last_run: failedLastRun,
        sources,
      },
      api_keys: apiKeys,
      api_quota: getQuotaStatus(),
      pool: {
        api: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
        batch: { total: batchPool.totalCount, idle: batchPool.idleCount, waiting: batchPool.waitingCount },
      },
      memory: (() => {
        const mem = process.memoryUsage();
        return {
          rss_mb: Math.round(mem.rss / 1048576),
          heap_used_mb: Math.round(mem.heapUsed / 1048576),
          heap_total_mb: Math.round(mem.heapTotal / 1048576),
        };
      })(),
      circuit_breakers: Object.fromEntries(
        [...getCircuitStates()].map(([k, v]) => [k, {
          failures: v.failures,
          is_open: v.openedAt !== null,
          cooldown_remaining_ms: v.openedAt
            ? Math.max(0, CIRCUIT_BREAKER_COOLDOWN_MS - (Date.now() - v.openedAt))
            : 0,
        }]),
      ),
      embedding_cache_size: getEmbeddingCacheSize(),
      feature_flags: getFeatureFlags(),
      uptime_seconds: Math.round(process.uptime()),
    });
  };
  app.get('/health', handler);
  app.get('/api/health', handler);

  // 데이터 신선도 SLO 전용 — UptimeRobot 등 외부 모니터가 SLO 위반 시 503 으로 즉시 감지.
  // /health 와 분리된 이유: Fly machine healthcheck 가 /health 의 503 을 critical 로 잡아
  // 라우팅을 차단하면 사용자 다운으로 직결됨 (2026-04-12 사고).
  const freshnessHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
    let dbConnected = true;
    try {
      await app.pg.query('SELECT 1');
    } catch {
      dbConnected = false;
    }
    const ageSec = dbConnected ? await readIssueDataAgeSeconds(app) : null;
    const isStale = !dbConnected || ageSec === null || ageSec > ISSUE_DATA_SLO_SECONDS;
    return reply.status(isStale ? 503 : 200).send({
      status: isStale ? 'stale' : 'ok',
      db: { connected: dbConnected },
      issue_data: {
        age_seconds: ageSec,
        slo_seconds: ISSUE_DATA_SLO_SECONDS,
        is_stale: isStale,
      },
    });
  };
  app.get('/health/freshness', freshnessHandler);
  app.get('/api/health/freshness', freshnessHandler);
}
