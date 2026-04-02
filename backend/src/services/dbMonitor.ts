import type { Pool } from 'pg';
import { config } from '../config/index.js';

const DB_WARN_BYTES = 400 * 1024 * 1024;  // 400MB
const DB_CRIT_BYTES = 475 * 1024 * 1024;  // 475MB

interface DbSizeInfo {
  sizeBytes: number;
  sizeMB: string;
  tableBreakdown: { table: string; sizeMB: string }[];
}

async function getDbSize(pool: Pool): Promise<DbSizeInfo> {
  const { rows: [{ size_bytes }] } = await pool.query<{ size_bytes: string }>(
    `SELECT pg_database_size(current_database()) AS size_bytes`,
  );

  const { rows: tables } = await pool.query<{ table: string; size_mb: string }>(`
    SELECT relname AS table,
           pg_size_pretty(pg_total_relation_size(relid)) AS size_mb
    FROM pg_catalog.pg_statio_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 10
  `);

  const sizeBytes = Number(size_bytes);
  return {
    sizeBytes,
    sizeMB: (sizeBytes / 1024 / 1024).toFixed(1),
    tableBreakdown: tables.map(t => ({ table: t.table, sizeMB: t.size_mb })),
  };
}

async function sendDiscordAlert(level: 'warn' | 'critical', info: DbSizeInfo): Promise<void> {
  if (!config.discordWebhookUrl) return;

  const color = level === 'critical' ? 0xff0000 : 0xffa500;
  const emoji = level === 'critical' ? '🚨' : '⚠️';
  const breakdown = info.tableBreakdown
    .slice(0, 5)
    .map(t => `• \`${t.table}\`: ${t.sizeMB}`)
    .join('\n');

  const body = {
    embeds: [{
      title: `${emoji} DB 용량 ${level === 'critical' ? '위험' : '경고'} — ${info.sizeMB}MB / 500MB`,
      description: `**테이블별 사용량 (상위 5개):**\n${breakdown}`,
      color,
      footer: { text: new Date().toISOString() },
    }],
  };

  try {
    const res = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`[db-monitor] discord webhook failed: ${res.status}`);
  } catch (err) {
    console.error('[db-monitor] discord alert error:', err);
  }
}

export async function checkDbSize(pool: Pool): Promise<void> {
  try {
    const info = await getDbSize(pool);
    console.log(`[db-monitor] size: ${info.sizeMB}MB`);

    if (info.sizeBytes >= DB_CRIT_BYTES) {
      await sendDiscordAlert('critical', info);
    } else if (info.sizeBytes >= DB_WARN_BYTES) {
      await sendDiscordAlert('warn', info);
    }
  } catch (err) {
    console.error('[db-monitor] check failed:', err);
  }
}
