/**
 * Data Quality Audit — 95개 활성 소스 전수조사
 * Usage: npx tsx backend/src/scripts/data-quality-audit.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── DB connection ──────────────────────────────
const dbUrl = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/trend_korea';
const isSSL = dbUrl.includes('supabase.com') || dbUrl.includes('sslmode=require');
const pool = new Pool({
  connectionString: dbUrl,
  max: 8,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  ...(isSSL && { ssl: { rejectUnauthorized: false } }),
});

// ── Load sources.json for type mapping ─────────
const __dirname = dirname(fileURLToPath(import.meta.url));
interface SourceDef {
  key: string;
  name: string;
  category: string;
  type: 'rss' | 'html' | 'api' | 'apify';
  priority: string;
  enabled: boolean;
}
const sourcesJson: { sources: SourceDef[] } = JSON.parse(
  readFileSync(join(__dirname, '..', 'scrapers', 'sources.json'), 'utf-8'),
);
const enabledSources = sourcesJson.sources.filter(s => s.enabled);
const sourceTypeMap = new Map(enabledSources.map(s => [s.key, s.type]));
const sourceCategoryMap = new Map(enabledSources.map(s => [s.key, s.category]));
const sourceNameMap = new Map(enabledSources.map(s => [s.key, s.name]));

// ── Severity types ─────────────────────────────
type Severity = 'OK' | 'WARN' | 'CRITICAL';

interface Anomaly {
  field: string;
  description: string;
  severity: Severity;
  value: string | number;
}

interface SourceReport {
  source_key: string;
  source_name: string;
  type: string;
  category: string;
  severity: Severity;
  anomalies: Anomaly[];
  stats: Record<string, unknown>;
}

// ── 7 Query Groups ─────────────────────────────

const Q1_PUBLISHED_AT = `
SELECT
  source_key,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE published_at IS NULL)::int AS null_pub,
  COUNT(*) FILTER (WHERE published_at > NOW() + INTERVAL '1 hour')::int AS future,
  COUNT(*) FILTER (WHERE published_at < NOW() - INTERVAL '30 days')::int AS very_old,
  COUNT(*) FILTER (WHERE published_at < '2020-01-01')::int AS ancient,
  MIN(published_at) AS earliest,
  MAX(published_at) AS latest
FROM posts
GROUP BY source_key
ORDER BY source_key;
`;

const Q2_ENGAGEMENT = `
SELECT
  source_key,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE view_count = 0 AND comment_count = 0 AND like_count = 0)::int AS zero_eng,
  COUNT(*) FILTER (WHERE view_count < 0 OR comment_count < 0 OR like_count < 0)::int AS negative,
  COUNT(*) FILTER (WHERE view_count > 10000000)::int AS extreme_views,
  COUNT(*) FILTER (WHERE comment_count > 100000)::int AS extreme_comments,
  COUNT(*) FILTER (WHERE like_count > 1000000)::int AS extreme_likes,
  AVG(view_count)::int AS avg_views,
  MAX(view_count)::int AS max_views,
  AVG(comment_count)::int AS avg_comments,
  MAX(comment_count)::int AS max_comments,
  AVG(like_count)::int AS avg_likes,
  MAX(like_count)::int AS max_likes
FROM posts
GROUP BY source_key
ORDER BY source_key;
`;

const Q3_AUTHOR_THUMB = `
SELECT
  source_key,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE author IS NULL OR author = '')::int AS no_author,
  COUNT(*) FILTER (WHERE LENGTH(author) <= 1)::int AS short_author,
  COUNT(*) FILTER (WHERE author ~ '^[0-9]+$')::int AS numeric_author,
  COUNT(*) FILTER (WHERE thumbnail IS NULL OR thumbnail = '')::int AS no_thumb,
  COUNT(*) FILTER (WHERE thumbnail IS NOT NULL AND thumbnail != '' AND thumbnail NOT LIKE 'http%')::int AS bad_thumb_url
FROM posts
GROUP BY source_key
ORDER BY source_key;
`;

const Q4_TITLE_URL = `
SELECT
  source_key,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE LENGTH(title) < 3)::int AS short_title,
  COUNT(*) FILTER (WHERE title ~ '^[0-9]+$')::int AS numeric_title,
  COUNT(*) FILTER (WHERE title LIKE '%&amp;%' OR title LIKE '%&lt;%' OR title LIKE '%&gt;%')::int AS html_entities,
  COUNT(*) FILTER (WHERE url NOT LIKE 'http%')::int AS bad_url,
  COUNT(*) FILTER (WHERE content_snippet IS NULL OR content_snippet = '')::int AS no_snippet,
  COUNT(*) FILTER (WHERE metadata IS NULL)::int AS no_metadata
FROM posts
GROUP BY source_key
ORDER BY source_key;
`;

const Q5_CATEGORY = `
SELECT
  source_key,
  category,
  subcategory,
  COUNT(*)::int AS cnt
FROM posts
GROUP BY source_key, category, subcategory
ORDER BY source_key, cnt DESC;
`;

const Q6_SCRAPER_HEALTH = `
SELECT
  source_key,
  COUNT(*)::int AS total_runs,
  COUNT(*) FILTER (WHERE error_message IS NULL)::int AS success_runs,
  COUNT(*) FILTER (WHERE error_message IS NOT NULL)::int AS error_runs,
  ROUND(100.0 * COUNT(*) FILTER (WHERE error_message IS NULL) / NULLIF(COUNT(*), 0), 1) AS success_rate,
  ROUND(AVG(posts_saved) FILTER (WHERE error_message IS NULL), 1) AS avg_posts,
  COUNT(*) FILTER (WHERE posts_saved = 0 AND error_message IS NULL)::int AS zero_post_success,
  MAX(started_at) AS last_run,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(started_at))) / 3600, 1) AS hours_since_last,
  MODE() WITHIN GROUP (ORDER BY LEFT(error_message, 120)) FILTER (WHERE error_message IS NOT NULL) AS top_error
FROM scraper_runs
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY source_key
ORDER BY success_rate ASC NULLS FIRST;
`;

const Q7_FRESHNESS = `
SELECT
  source_key,
  COUNT(*)::int AS total_in_db,
  COUNT(*) FILTER (WHERE scraped_at > NOW() - INTERVAL '24 hours')::int AS last_24h,
  COUNT(*) FILTER (WHERE scraped_at > NOW() - INTERVAL '1 hour')::int AS last_1h,
  MAX(scraped_at) AS last_scraped,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(scraped_at))) / 3600, 1) AS hours_stale
FROM posts
GROUP BY source_key
ORDER BY hours_stale DESC NULLS FIRST;
`;

// ── Anomaly Detection ──────────────────────────

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

function detectAnomalies(
  key: string,
  q1: Record<string, unknown>,
  q2: Record<string, unknown>,
  q3: Record<string, unknown>,
  q4: Record<string, unknown>,
  catRows: Record<string, unknown>[],
  q6: Record<string, unknown> | undefined,
  q7: Record<string, unknown>,
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const type = sourceTypeMap.get(key) ?? 'unknown';
  const expectedCat = sourceCategoryMap.get(key);

  const total1 = (q1?.total as number) ?? 0;
  const total2 = (q2?.total as number) ?? 0;

  // Q1: published_at
  if (total1 > 0) {
    const nullPub = (q1.null_pub as number) ?? 0;
    const nullPct = pct(nullPub, total1);
    if (nullPct > 50) {
      const sev: Severity = type === 'rss' ? 'WARN' : 'CRITICAL';
      anomalies.push({ field: 'published_at', description: `NULL ${nullPct}%`, severity: sev, value: `${nullPub}/${total1}` });
    }
    const future = (q1.future as number) ?? 0;
    if (future > 0) {
      anomalies.push({ field: 'published_at', description: `미래일자 ${future}건`, severity: 'CRITICAL', value: `latest: ${q1.latest}` });
    }
    const ancient = (q1.ancient as number) ?? 0;
    if (ancient > 0) {
      anomalies.push({ field: 'published_at', description: `2020년 이전 ${ancient}건`, severity: 'WARN', value: `earliest: ${q1.earliest}` });
    }
  }

  // Q2: Engagement
  if (total2 > 0) {
    const negative = (q2.negative as number) ?? 0;
    if (negative > 0) {
      anomalies.push({ field: 'engagement', description: `음수값 ${negative}건`, severity: 'CRITICAL', value: negative });
    }
    const extremeViews = (q2.extreme_views as number) ?? 0;
    if (extremeViews > 0) {
      anomalies.push({ field: 'view_count', description: `1천만+ 조회 ${extremeViews}건`, severity: 'WARN', value: `max: ${q2.max_views}` });
    }
    const extremeComments = (q2.extreme_comments as number) ?? 0;
    if (extremeComments > 0) {
      anomalies.push({ field: 'comment_count', description: `10만+ 댓글 ${extremeComments}건`, severity: 'WARN', value: `max: ${q2.max_comments}` });
    }
    const extremeLikes = (q2.extreme_likes as number) ?? 0;
    if (extremeLikes > 0) {
      anomalies.push({ field: 'like_count', description: `100만+ 좋아요 ${extremeLikes}건`, severity: 'WARN', value: `max: ${q2.max_likes}` });
    }
    const zeroEng = (q2.zero_eng as number) ?? 0;
    const zeroPct = pct(zeroEng, total2);
    if (zeroPct === 100 && type !== 'rss') {
      anomalies.push({ field: 'engagement', description: `engagement 전부 0 (${type})`, severity: type === 'api' ? 'CRITICAL' : 'WARN', value: `${zeroEng}/${total2}` });
    }
  }

  // Q3: Author / Thumbnail
  if (q3) {
    const total3 = (q3.total as number) ?? 0;
    const badThumb = (q3.bad_thumb_url as number) ?? 0;
    if (badThumb > 0) {
      anomalies.push({ field: 'thumbnail', description: `잘못된 URL ${badThumb}건`, severity: 'WARN', value: badThumb });
    }
    const numericAuthor = (q3.numeric_author as number) ?? 0;
    if (numericAuthor > 0 && total3 > 0 && pct(numericAuthor, total3) > 10) {
      anomalies.push({ field: 'author', description: `숫자만 작성자 ${pct(numericAuthor, total3)}%`, severity: 'WARN', value: `${numericAuthor}/${total3}` });
    }
  }

  // Q4: Title / URL / Snippet / Metadata
  if (q4) {
    const total4 = (q4.total as number) ?? 0;
    const shortTitle = (q4.short_title as number) ?? 0;
    if (shortTitle > 0) {
      anomalies.push({ field: 'title', description: `3자 미만 제목 ${shortTitle}건`, severity: shortTitle > 3 ? 'CRITICAL' : 'WARN', value: shortTitle });
    }
    const numericTitle = (q4.numeric_title as number) ?? 0;
    if (numericTitle > 0) {
      anomalies.push({ field: 'title', description: `숫자만 제목 ${numericTitle}건`, severity: 'CRITICAL', value: numericTitle });
    }
    const htmlEnt = (q4.html_entities as number) ?? 0;
    if (htmlEnt > 0 && total4 > 0 && pct(htmlEnt, total4) > 5) {
      anomalies.push({ field: 'title', description: `HTML 엔티티 잔류 ${pct(htmlEnt, total4)}%`, severity: 'WARN', value: `${htmlEnt}/${total4}` });
    }
    const badUrl = (q4.bad_url as number) ?? 0;
    if (badUrl > 0) {
      anomalies.push({ field: 'url', description: `http로 시작 안 하는 URL ${badUrl}건`, severity: 'CRITICAL', value: badUrl });
    }
    const noMeta = (q4.no_metadata as number) ?? 0;
    if (type === 'api' && total4 > 0 && noMeta === total4) {
      anomalies.push({ field: 'metadata', description: `API 소스인데 metadata 전부 NULL`, severity: 'CRITICAL', value: `${noMeta}/${total4}` });
    }
  }

  // Q5: Category consistency
  if (catRows.length > 0 && expectedCat) {
    for (const row of catRows) {
      if (row.category !== expectedCat) {
        anomalies.push({
          field: 'category',
          description: `기대 "${expectedCat}" vs 실제 "${row.category}" (${row.cnt}건)`,
          severity: 'WARN',
          value: row.cnt as number,
        });
      }
    }
  }

  // Q6: Scraper health
  if (q6) {
    const successRate = Number(q6.success_rate ?? 0);
    if (successRate < 50) {
      anomalies.push({ field: 'scraper', description: `성공률 ${successRate}% (7일)`, severity: 'CRITICAL', value: `${q6.success_runs}/${q6.total_runs}` });
    } else if (successRate < 80) {
      anomalies.push({ field: 'scraper', description: `성공률 ${successRate}% (7일)`, severity: 'WARN', value: `${q6.success_runs}/${q6.total_runs}` });
    }
    const hoursSince = Number(q6.hours_since_last ?? 999);
    if (hoursSince > 2) {
      anomalies.push({ field: 'scraper', description: `${hoursSince}시간 미실행`, severity: hoursSince > 6 ? 'CRITICAL' : 'WARN', value: `last: ${q6.last_run}` });
    }
    if (q6.top_error) {
      anomalies.push({ field: 'scraper', description: `주요 에러: ${q6.top_error}`, severity: 'WARN', value: `${q6.error_runs}건` });
    }
  } else {
    anomalies.push({ field: 'scraper', description: '7일간 실행 기록 없음', severity: 'CRITICAL', value: 0 });
  }

  // Q7: Freshness
  if (q7) {
    const last24h = (q7.last_24h as number) ?? 0;
    if (last24h === 0) {
      anomalies.push({ field: 'freshness', description: '24시간 수집 0건', severity: 'CRITICAL', value: `total: ${q7.total_in_db}` });
    }
    const totalInDb = (q7.total_in_db as number) ?? 0;
    if (totalInDb === 0) {
      anomalies.push({ field: 'freshness', description: 'DB에 게시물 0건', severity: 'CRITICAL', value: 0 });
    }
  }

  return anomalies;
}

function maxSeverity(anomalies: Anomaly[]): Severity {
  if (anomalies.some(a => a.severity === 'CRITICAL')) return 'CRITICAL';
  if (anomalies.some(a => a.severity === 'WARN')) return 'WARN';
  return 'OK';
}

// ── Main ───────────────────────────────────────

async function main() {
  console.log('=== WeekLit 데이터 품질 전수조사 ===\n');
  console.log(`활성 소스: ${enabledSources.length}개\n`);

  const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
    pool.query(Q1_PUBLISHED_AT),
    pool.query(Q2_ENGAGEMENT),
    pool.query(Q3_AUTHOR_THUMB),
    pool.query(Q4_TITLE_URL),
    pool.query(Q5_CATEGORY),
    pool.query(Q6_SCRAPER_HEALTH),
    pool.query(Q7_FRESHNESS),
  ]);

  // Index results by source_key
  const idx = <T extends { source_key: string }>(rows: T[]): Map<string, T> =>
    new Map(rows.map(r => [r.source_key, r]));

  const m1 = idx(r1.rows);
  const m2 = idx(r2.rows);
  const m3 = idx(r3.rows);
  const m4 = idx(r4.rows);
  const m6 = idx(r6.rows);
  const m7 = idx(r7.rows);

  // Category rows grouped by source_key
  const catBySource = new Map<string, Record<string, unknown>[]>();
  for (const row of r5.rows) {
    const arr = catBySource.get(row.source_key) ?? [];
    arr.push(row);
    catBySource.set(row.source_key, arr);
  }

  // Build per-source reports
  const reports: SourceReport[] = [];
  for (const src of enabledSources) {
    const { key } = src;
    const anomalies = detectAnomalies(
      key,
      m1.get(key) ?? {} as Record<string, unknown>,
      m2.get(key) ?? {} as Record<string, unknown>,
      m3.get(key) ?? {} as Record<string, unknown>,
      m4.get(key) ?? {} as Record<string, unknown>,
      catBySource.get(key) ?? [],
      m6.get(key),
      m7.get(key) ?? {} as Record<string, unknown>,
    );

    reports.push({
      source_key: key,
      source_name: sourceNameMap.get(key) ?? key,
      type: sourceTypeMap.get(key) ?? 'unknown',
      category: sourceCategoryMap.get(key) ?? 'unknown',
      severity: maxSeverity(anomalies),
      anomalies,
      stats: {
        total_posts: (m7.get(key) as Record<string, unknown>)?.total_in_db ?? 0,
        last_24h: (m7.get(key) as Record<string, unknown>)?.last_24h ?? 0,
        success_rate: m6.get(key) ? Number((m6.get(key) as Record<string, unknown>).success_rate) : null,
        avg_views: (m2.get(key) as Record<string, unknown>)?.avg_views ?? 0,
        null_published_pct: m1.get(key)
          ? pct((m1.get(key) as Record<string, unknown>).null_pub as number, (m1.get(key) as Record<string, unknown>).total as number)
          : null,
      },
    });
  }

  // Sort: CRITICAL first, then WARN, then OK
  const sevOrder: Record<Severity, number> = { CRITICAL: 0, WARN: 1, OK: 2 };
  reports.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  // ── Print Summary ────────────────────────────
  const critical = reports.filter(r => r.severity === 'CRITICAL');
  const warn = reports.filter(r => r.severity === 'WARN');
  const ok = reports.filter(r => r.severity === 'OK');

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  CRITICAL: ${critical.length}개  |  WARN: ${warn.length}개  |  OK: ${ok.length}개`);
  console.log(`${'─'.repeat(60)}\n`);

  // Print CRITICAL sources in detail
  if (critical.length > 0) {
    console.log('=== CRITICAL 소스 ===\n');
    for (const r of critical) {
      console.log(`[CRITICAL] ${r.source_key} (${r.source_name}) [${r.type}/${r.category}]`);
      console.log(`  posts: ${(r.stats.total_posts as number) ?? 0}, 24h: ${(r.stats.last_24h as number) ?? 0}, 성공률: ${r.stats.success_rate ?? 'N/A'}%`);
      for (const a of r.anomalies) {
        const marker = a.severity === 'CRITICAL' ? '!!!' : ' ! ';
        console.log(`  ${marker} [${a.field}] ${a.description} (${a.value})`);
      }
      console.log('');
    }
  }

  // Print WARN sources
  if (warn.length > 0) {
    console.log('=== WARN 소스 ===\n');
    for (const r of warn) {
      console.log(`[WARN] ${r.source_key} (${r.source_name}) [${r.type}/${r.category}]`);
      for (const a of r.anomalies) {
        console.log(`   !  [${a.field}] ${a.description} (${a.value})`);
      }
      console.log('');
    }
  }

  // Print OK sources (compact)
  if (ok.length > 0) {
    console.log('=== OK 소스 ===\n');
    for (const r of ok) {
      console.log(`[OK] ${r.source_key} (${r.source_name}) — posts: ${r.stats.total_posts}, 24h: ${r.stats.last_24h}`);
    }
    console.log('');
  }

  // ── Raw Data Dump ────────────────────────────
  console.log('\n=== RAW: published_at 상세 ===\n');
  console.log('source_key'.padEnd(25) + 'total'.padStart(7) + 'null%'.padStart(7) + 'future'.padStart(8) + 'old30d'.padStart(8) + '<2020'.padStart(8) + '  earliest → latest');
  for (const row of r1.rows) {
    const nullPct = pct(row.null_pub, row.total);
    console.log(
      (row.source_key as string).padEnd(25) +
      String(row.total).padStart(7) +
      `${nullPct}%`.padStart(7) +
      String(row.future).padStart(8) +
      String(row.very_old).padStart(8) +
      String(row.ancient).padStart(8) +
      `  ${row.earliest ? new Date(row.earliest).toISOString().slice(0, 16) : 'NULL'} → ${row.latest ? new Date(row.latest).toISOString().slice(0, 16) : 'NULL'}`,
    );
  }

  console.log('\n=== RAW: engagement 상세 ===\n');
  console.log('source_key'.padEnd(25) + 'total'.padStart(7) + 'zero%'.padStart(7) + 'neg'.padStart(6) + 'avgV'.padStart(10) + 'maxV'.padStart(12) + 'avgC'.padStart(8) + 'avgL'.padStart(8));
  for (const row of r2.rows) {
    const zeroPct = pct(row.zero_eng, row.total);
    console.log(
      (row.source_key as string).padEnd(25) +
      String(row.total).padStart(7) +
      `${zeroPct}%`.padStart(7) +
      String(row.negative).padStart(6) +
      String(row.avg_views ?? 0).padStart(10) +
      String(row.max_views ?? 0).padStart(12) +
      String(row.avg_comments ?? 0).padStart(8) +
      String(row.avg_likes ?? 0).padStart(8),
    );
  }

  console.log('\n=== RAW: scraper 건강도 (7일) ===\n');
  console.log('source_key'.padEnd(25) + 'runs'.padStart(6) + 'rate%'.padStart(7) + 'avg_p'.padStart(7) + 'hrs'.padStart(7) + '  top_error');
  for (const row of r6.rows) {
    console.log(
      (row.source_key as string).padEnd(25) +
      String(row.total_runs).padStart(6) +
      `${row.success_rate}%`.padStart(7) +
      String(row.avg_posts ?? 0).padStart(7) +
      String(row.hours_since_last ?? '?').padStart(7) +
      `  ${row.top_error ? (row.top_error as string).slice(0, 60) : '-'}`,
    );
  }

  // ── Missing sources (enabled but no runs / no posts) ──
  const sourcesWithRuns = new Set(r6.rows.map((r: Record<string, unknown>) => r.source_key));
  const sourcesWithPosts = new Set(r7.rows.map((r: Record<string, unknown>) => r.source_key));
  const missingRuns = enabledSources.filter(s => !sourcesWithRuns.has(s.key));
  const missingPosts = enabledSources.filter(s => !sourcesWithPosts.has(s.key));

  if (missingRuns.length > 0) {
    console.log(`\n=== 7일간 실행 기록 없는 소스 (${missingRuns.length}개) ===`);
    for (const s of missingRuns) {
      console.log(`  - ${s.key} (${s.name}) [${s.type}/${s.category}]`);
    }
  }
  if (missingPosts.length > 0) {
    console.log(`\n=== DB에 게시물 없는 소스 (${missingPosts.length}개) ===`);
    for (const s of missingPosts) {
      console.log(`  - ${s.key} (${s.name}) [${s.type}/${s.category}]`);
    }
  }

  await pool.end();
  console.log('\n=== 감사 완료 ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
