import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/index.js';
import { checkApiKeys } from '../services/apiKeyHealth.js';

interface ScraperRunRow {
  source_key: string;
  last_run_at: string | null;
  last_post_count: number | null;
  last_error: string | null;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const isProduction = config.nodeEnv === 'production';
    // 프로덕션에서 ADMIN_TOKEN 미설정 시 어드민 접근 거부
    const isAdmin = !isProduction && config.adminToken === ''
      ? true
      : token !== '' && token === config.adminToken;

    // 1. DB 연결 확인
    try {
      await app.pg.query('SELECT 1');
    } catch {
      const minimal = { status: 'degraded', db: { connected: false } };
      if (!isAdmin) return reply.status(503).send(minimal);
      return reply.status(503).send({
        ...minimal,
        db: { connected: false, post_count: 0, db_size_mb: 0, oldest_post_age_days: 0 },
        scrapers: { total: 0, last_run_at: null, failed_last_run: 0, sources: [] },
      });
    }

    // 공개 응답: 상태만 반환
    if (!isAdmin) {
      return reply.status(200).send({ status: 'ok', db: { connected: true } });
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

    return reply.status(200).send({
      status: failedLastRun === 0 && !hasInvalidKey ? 'ok' : 'degraded',
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
    });
  };
  app.get('/health', handler);
  app.get('/api/health', handler);
}
