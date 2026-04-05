import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { pool } from '../db/client.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const gzipAsync = promisify(gzip);
const BUCKET = 'db-backups';

// 복구 시 중요한 테이블만 백업 (scraper_runs, engagement_snapshots 등 재생성 가능 데이터 제외)
const BACKUP_TABLES = [
  'posts',
  'post_clusters',
  'post_cluster_members',
  'post_scores',
  'post_votes',
  'trend_keywords',
  'issue_rankings',
  'schema_migrations',
] as const;

const ALLOWED_TABLES = new Set<string>(BACKUP_TABLES);

interface BackupResult {
  success: boolean;
  fileName?: string;
  sizeBytes?: number;
  durationMs?: number;
  error?: string;
}

/** 테이블 데이터를 JSONL 형식으로 추출 */
async function dumpTable(tableName: string): Promise<string> {
  // SQL injection 방어: 허용된 테이블만 처리
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`dumpTable: disallowed table "${tableName}"`);
  }

  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 AND table_schema = 'public'
     ORDER BY ordinal_position`,
    [tableName],
  );
  if (!rows.length) return '';

  const columns = rows.map((r: { column_name: string }) => r.column_name);

  // GENERATED ALWAYS 컬럼(title_hash 등) 제외 — INSERT 시 자동 생성됨
  const { rows: genCols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 AND table_schema = 'public'
       AND is_generated = 'ALWAYS'`,
    [tableName],
  );
  const generatedSet = new Set(genCols.map((r: { column_name: string }) => r.column_name));
  const insertCols = columns.filter((c: string) => !generatedSet.has(c));

  // 식별자 인용: SQL injection 방지
  const safeTable = `"${tableName}"`;
  const safeCols = insertCols.map((c: string) => `"${c}"`).join(', ');
  const dataRows = await pool.query(`SELECT row_to_json(t) FROM (SELECT ${safeCols} FROM ${safeTable}) t`);
  const header = `-- TABLE: ${tableName} (${dataRows.rowCount} rows)\n`;
  const jsonLines = dataRows.rows.map((r: { row_to_json: unknown }) => JSON.stringify(r.row_to_json));
  return header + jsonLines.join('\n') + '\n';
}

/** Supabase Storage에 파일 업로드 (REST API 직접 호출) */
async function uploadToStorage(fileName: string, data: Uint8Array): Promise<void> {
  const url = `${config.supabaseUrl}/storage/v1/object/${BUCKET}/${fileName}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      'Content-Type': 'application/gzip',
      'x-upsert': 'true',
    },
    body: Buffer.from(data) as unknown as BodyInit,
    signal: AbortSignal.timeout(120_000), // 2분 타임아웃
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Storage upload failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

/** 오래된 백업 파일 삭제 */
async function cleanOldBackups(): Promise<number> {
  const url = `${config.supabaseUrl}/storage/v1/object/list/${BUCKET}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: '', limit: 100, sortBy: { column: 'created_at', order: 'asc' } }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) return 0;

  const raw = await res.json();
  const files: { name: string; created_at: string }[] = Array.isArray(raw) ? raw : [];
  const cutoff = Date.now() - config.backupRetentionDays * 24 * 60 * 60 * 1000;
  const toDelete = files.filter(f => new Date(f.created_at).getTime() < cutoff);

  if (!toDelete.length) return 0;

  const deleteUrl = `${config.supabaseUrl}/storage/v1/object/${BUCKET}`;
  const delRes = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: toDelete.map(f => f.name) }),
    signal: AbortSignal.timeout(30_000),
  });

  return delRes.ok ? toDelete.length : 0;
}

/** 메인 백업 실행 */
export async function performDatabaseBackup(): Promise<BackupResult> {
  if (!config.backupEnabled) {
    logger.info('[backup] disabled — skipping');
    return { success: true };
  }

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    logger.warn('[backup] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping');
    return { success: false, error: 'Missing Supabase credentials' };
  }

  const startTime = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `trend-korea-${date}.jsonl.gz`;

  try {
    // 1. 각 테이블 데이터 추출
    const parts: string[] = [];
    for (const table of BACKUP_TABLES) {
      try {
        const data = await dumpTable(table);
        parts.push(data);
      } catch (err) {
        logger.warn({ err, table }, '[backup] table dump failed — skipping');
      }
    }

    const raw = parts.join('\n');
    const compressed = await gzipAsync(Buffer.from(raw, 'utf-8'), { level: 9 });

    // 2. 업로드
    await uploadToStorage(fileName, compressed);

    // 3. 오래된 백업 정리
    const deleted = await cleanOldBackups().catch(() => 0);

    const durationMs = Date.now() - startTime;
    logger.info({
      fileName,
      rawSizeKB: Math.round(raw.length / 1024),
      compressedSizeKB: Math.round(compressed.length / 1024),
      durationMs,
      deletedOldBackups: deleted,
    }, '[backup] completed');

    return { success: true, fileName, sizeBytes: compressed.length, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, durationMs }, '[backup] failed');
    return { success: false, error, durationMs };
  }
}
