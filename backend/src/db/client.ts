import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const isSSL = config.dbUrl.includes('supabase.com') || config.dbUrl.includes('sslmode=require');

export const pool = new Pool({
  connectionString: config.dbUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: config.dbIdleTimeoutMs,
  connectionTimeoutMillis: config.dbConnectionTimeoutMs,
  ...(isSSL && { ssl: { rejectUnauthorized: false } }),
});

pool.on('error', (err) => {
  logger.error({ err }, '[db:pool] idle client error');
});

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
  logger.info('[db] draining connection pool...');
  const timeout = new Promise<void>(resolve => setTimeout(resolve, 5_000));
  await Promise.race([pool.end(), timeout]);
  logger.info('[db] pool closed');
}

// Note: shutdown handlers are registered in server.ts to coordinate with Fastify close
