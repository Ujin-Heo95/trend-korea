import { Pool } from 'pg';
import { config } from '../config/index.js';

const isSSL = config.dbUrl.includes('supabase.com') || config.dbUrl.includes('sslmode=require');

export const pool = new Pool({
  connectionString: config.dbUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: config.dbIdleTimeoutMs,
  connectionTimeoutMillis: config.dbConnectionTimeoutMs,
  ...(isSSL && { ssl: { rejectUnauthorized: false } }),
});

pool.on('error', (err) => {
  console.error('[db:pool] idle client error:', err.message);
});
