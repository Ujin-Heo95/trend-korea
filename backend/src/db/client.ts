import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const isSSL = config.dbUrl.includes('supabase.com') || config.dbUrl.includes('sslmode=require');
const sslOpts = isSSL ? { ssl: { rejectUnauthorized: false } } : {};

// API pool: lower max, shorter timeouts — serves real-time HTTP requests
const apiPoolMax = Math.max(Math.floor(config.dbPoolMax * 0.4), 4); // ~40% of total
export const pool = new Pool({
  connectionString: config.dbUrl,
  max: apiPoolMax,
  min: 2,
  idleTimeoutMillis: config.dbIdleTimeoutMs,
  connectionTimeoutMillis: config.dbConnectionTimeoutMs,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  ...sslOpts,
});

// Batch pool: higher max, longer timeouts — serves scheduler/scrapers/scoring
const batchPoolMax = config.dbPoolMax - apiPoolMax;
export const batchPool = new Pool({
  connectionString: config.dbUrl,
  max: batchPoolMax,
  min: 1,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  ...sslOpts,
});

pool.on('error', (err) => {
  logger.error({ err }, '[db:pool:api] idle client error');
});

batchPool.on('error', (err) => {
  logger.error({ err }, '[db:pool:batch] idle client error');
});

// ── Pool monitoring ────────────────────────────

pool.on('connect', () => {
  if (pool.waitingCount > 0) {
    logger.warn(
      { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      '[db:pool] new connection while queries waiting',
    );
  }
});

pool.on('acquire', () => {
  if (pool.waitingCount > 2) {
    logger.warn(
      { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      '[db:pool] high contention — queries queued',
    );
  }
});

pool.on('remove', () => {
  logger.debug(
    { total: pool.totalCount, idle: pool.idleCount },
    '[db:pool] connection removed',
  );
});

/** Log current pool stats (call from scheduler or health checks) */
export function logPoolStats(label = ''): void {
  const prefix = label ? `[db:pool:${label}]` : '[db:pool]';
  const stats = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
  if (stats.waiting > 0) {
    logger.warn(stats, `${prefix} connections exhausted`);
  } else {
    logger.info(stats, `${prefix} stats`);
  }
}

// ── Connection error detection ──────────────────────────

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
]);

function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code !== undefined && CONNECTION_ERROR_CODES.has(code);
}

// ── Query with single retry on connection errors ────────

export async function queryWithRetry<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (err) {
    if (isConnectionError(err)) {
      logger.warn({ err }, '[db] connection error, retrying once');
      return pool.query<T>(text, params);
    }
    throw err;
  }
}

// ── Startup validation ──────────────────────────────────

export async function validateConnection(): Promise<void> {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await pool.query('SELECT 1');
      logger.info('[db] connection validated');
      return;
    } catch (err) {
      logger.error({ attempt, maxRetries: MAX_RETRIES, err }, '[db] connection attempt failed');
      if (attempt === MAX_RETRIES) throw err;
      const delayMs = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// ── Health check ────────────────────────────────────────

export async function checkDbHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// ── Graceful shutdown ───────────────────────────────────

export async function gracefulShutdown(): Promise<void> {
  logger.info('[db] draining connection pools...');
  const timeout = new Promise<void>(resolve => setTimeout(resolve, 5_000));
  await Promise.race([Promise.all([pool.end(), batchPool.end()]), timeout]);
  logger.info('[db] pools closed');
}

// Note: shutdown handlers are registered in server.ts to coordinate with Fastify close
