import { Pool } from 'pg';
import { config } from '../config/index.js';

export const pool = new Pool({
  connectionString: config.dbUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: config.dbIdleTimeoutMs,
  connectionTimeoutMillis: config.dbConnectionTimeoutMs,
});

pool.on('error', (err) => {
  console.error('[db:pool] idle client error:', err.message);
});
