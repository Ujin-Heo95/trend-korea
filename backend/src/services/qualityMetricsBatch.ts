/**
 * qualityMetricsBatch — 매 10분 tick에서 30+ 품질 메트릭을 산출해 quality_metrics 테이블에 적재.
 *
 * 목적: 사람 검수 없이도 회귀/이상을 즉시 감지하기 위한 데이터 기반 (품질 플라이휠 Stage 1).
 *
 * 카테고리:
 *   - 클러스터 건강성: size 분포, intra-cluster cos, source diversity, singleton ratio
 *   - 이슈 집계 건강성: NaN count, posts per issue, matched_kw count, cross_topic pairs
 *   - 키워드/IDF: coverage, df0 ratio, idf 분포
 *   - Gemini: 호출/실패 카운트(추후 확장 — 본 batch는 DB 메트릭 위주)
 */

import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { getKeywordIdfCoverage } from './keywordIdfBatch.js';
import { labelTopics } from './topicLabeler.js';

const WINDOW_HOURS = 24;

export interface QualityMetric {
  readonly name: string;
  readonly value: number;
  readonly dim?: Record<string, unknown>;
}

// ─── Pure helpers ───

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)));
  return sorted[idx];
}

export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function stddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  let sq = 0;
  for (const v of values) sq += (v - avg) ** 2;
  return Math.sqrt(sq / values.length);
}

function cosineFloat(a: readonly number[], b: readonly number[]): number | null {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ─── Cluster metrics ───

interface ClusterMember {
  readonly cluster_id: number;
  readonly post_id: number;
  readonly source_key: string;
  readonly title: string;
  readonly embedding: number[] | null;
}

async function loadClusterMembers(pool: Pool): Promise<ClusterMember[]> {
  const { rows } = await pool.query<ClusterMember>(`
    SELECT pcm.cluster_id, pcm.post_id, p.source_key, p.title, pe.embedding
    FROM post_cluster_members pcm
    JOIN posts p ON p.id = pcm.post_id
    LEFT JOIN post_embeddings pe ON pe.post_id = p.id
    WHERE p.scraped_at > NOW() - make_interval(hours => $1)
  `, [WINDOW_HOURS]);
  return rows;
}

export function computeClusterMetrics(members: readonly ClusterMember[]): QualityMetric[] {
  // 클러스터별 그룹화
  const byCluster = new Map<number, ClusterMember[]>();
  for (const m of members) {
    const arr = byCluster.get(m.cluster_id) ?? [];
    arr.push(m);
    byCluster.set(m.cluster_id, arr);
  }

  const sizes = Array.from(byCluster.values(), arr => arr.length).sort((a, b) => a - b);
  const total = sizes.length;
  if (total === 0) {
    return [{ name: 'cluster.cardinality_total', value: 0 }];
  }

  // 사이즈 분포
  const sizeP50 = percentile(sizes, 0.5);
  const sizeP95 = percentile(sizes, 0.95);
  const sizeP99 = percentile(sizes, 0.99);
  const sizeMax = sizes[sizes.length - 1];
  const sizeOver50Count = sizes.filter(s => s > 50).length;
  const singletonCount = sizes.filter(s => s === 1).length;

  // 클러스터별 source 다양성
  const sourceCounts: number[] = [];
  for (const arr of byCluster.values()) {
    sourceCounts.push(new Set(arr.map(m => m.source_key)).size);
  }
  sourceCounts.sort((a, b) => a - b);

  // intra-cluster 임베딩 cos (평균) — 표본 추출 (계산량 제한)
  const intraCosValues: number[] = [];
  let sampledClusters = 0;
  for (const arr of byCluster.values()) {
    if (arr.length < 2) continue;
    const withEmb = arr.filter(m => m.embedding && m.embedding.length > 0);
    if (withEmb.length < 2) continue;
    const sample = withEmb.slice(0, 10);
    let sum = 0, cnt = 0;
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        const c = cosineFloat(sample[i].embedding!, sample[j].embedding!);
        if (c != null) { sum += c; cnt++; }
      }
    }
    if (cnt > 0) intraCosValues.push(sum / cnt);
    sampledClusters++;
    if (sampledClusters >= 200) break;
  }
  intraCosValues.sort((a, b) => a - b);

  return [
    { name: 'cluster.cardinality_total', value: total },
    { name: 'cluster.size_p50', value: sizeP50 },
    { name: 'cluster.size_p95', value: sizeP95 },
    { name: 'cluster.size_p99', value: sizeP99 },
    { name: 'cluster.size_max', value: sizeMax },
    { name: 'cluster.size_over_50_count', value: sizeOver50Count },
    { name: 'cluster.singleton_ratio', value: singletonCount / total },
    { name: 'cluster.source_diversity_p50', value: percentile(sourceCounts, 0.5) },
    { name: 'cluster.source_diversity_p95', value: percentile(sourceCounts, 0.95) },
    { name: 'cluster.intra_cos_p50', value: percentile(intraCosValues, 0.5) },
    { name: 'cluster.intra_cos_p95', value: percentile(intraCosValues, 0.95) },
  ];
}

// ─── Issue metrics ───

interface IssueRow {
  readonly id: number;
  readonly title: string;
  readonly issue_score: number | null;
  readonly news_post_count: number;
  readonly community_post_count: number;
  readonly video_post_count: number;
  readonly cluster_ids: number[] | null;
  readonly standalone_post_ids: number[] | null;
  readonly matched_trend_keywords: string[] | null;
}

async function loadIssueRows(pool: Pool): Promise<IssueRow[]> {
  const { rows } = await pool.query<IssueRow>(`
    SELECT id, title, issue_score, news_post_count, community_post_count, video_post_count,
           cluster_ids, standalone_post_ids, matched_trend_keywords
    FROM issue_rankings
    WHERE expires_at > NOW()
  `);
  return rows;
}

export async function computeIssueMetrics(
  pool: Pool,
  issues: readonly IssueRow[],
): Promise<QualityMetric[]> {
  const total = issues.length;
  if (total === 0) {
    return [
      { name: 'issue.total', value: 0 },
      { name: 'issue.score_nan_count', value: 0 },
    ];
  }

  // NaN/null score 카운트 — 오늘 같은 누출 즉시 감지
  let nanCount = 0;
  for (const r of issues) {
    if (r.issue_score == null || !Number.isFinite(Number(r.issue_score))) nanCount++;
  }

  const postsPerIssue = issues.map(r =>
    (r.news_post_count ?? 0) + (r.community_post_count ?? 0) + (r.video_post_count ?? 0),
  ).sort((a, b) => a - b);

  const matchedKwCounts = issues.map(r => (r.matched_trend_keywords ?? []).length).sort((a, b) => a - b);

  // cross-topic 분석을 위해 각 이슈의 멤버 제목 조회 (top 30 이슈만 — 비용 제한)
  const topIssues = [...issues]
    .sort((a, b) => Number(b.issue_score ?? 0) - Number(a.issue_score ?? 0))
    .slice(0, 30);

  let crossTopicTotal = 0;
  let issuesWithCrossTopic = 0;
  let labelCountSum = 0;
  let labelCountSamples = 0;

  for (const issue of topIssues) {
    const clusterIds = issue.cluster_ids ?? [];
    const standaloneIds = issue.standalone_post_ids ?? [];
    if (clusterIds.length === 0 && standaloneIds.length === 0) continue;

    const { rows: posts } = await pool.query<{ title: string }>(
      `SELECT p.title FROM posts p
       WHERE p.id = ANY($1::int[])
          OR p.id IN (SELECT post_id FROM post_cluster_members WHERE cluster_id = ANY($2::int[]))
       LIMIT 50`,
      [standaloneIds, clusterIds],
    );
    const titles = posts.map(p => p.title).filter(Boolean);
    if (titles.length < 2) continue;

    const result = labelTopics(titles);
    crossTopicTotal += result.crossTopicPairs;
    if (result.labelCount >= 3) issuesWithCrossTopic++;
    labelCountSum += result.labelCount;
    labelCountSamples++;
  }

  return [
    { name: 'issue.total', value: total },
    { name: 'issue.score_nan_count', value: nanCount },
    { name: 'issue.posts_per_issue_p50', value: percentile(postsPerIssue, 0.5) },
    { name: 'issue.posts_per_issue_p95', value: percentile(postsPerIssue, 0.95) },
    { name: 'issue.matched_kw_count_p50', value: percentile(matchedKwCounts, 0.5) },
    { name: 'issue.matched_kw_count_p95', value: percentile(matchedKwCounts, 0.95) },
    { name: 'issue.cross_topic_pairs_total', value: crossTopicTotal },
    { name: 'issue.with_cross_topic_count', value: issuesWithCrossTopic },
    { name: 'issue.label_count_avg', value: labelCountSamples > 0 ? labelCountSum / labelCountSamples : 0 },
  ];
}

// ─── Keyword IDF metrics ───

export async function computeKeywordIdfMetrics(pool: Pool): Promise<QualityMetric[]> {
  const { rows } = await pool.query<{ df: number; idf: number }>(
    `SELECT df, idf FROM keyword_idf WHERE computed_at > NOW() - INTERVAL '24 hours'`,
  );
  if (rows.length === 0) {
    return [
      { name: 'keyword_idf.total', value: 0 },
      { name: 'keyword_idf.coverage_pct', value: 0 },
    ];
  }
  const total = rows.length;
  const df0 = rows.filter(r => Number(r.df) === 0).length;
  const idfs = rows.map(r => Number(r.idf));

  const coverage = await getKeywordIdfCoverage(pool);

  return [
    { name: 'keyword_idf.total', value: total },
    { name: 'keyword_idf.coverage_pct', value: coverage },
    { name: 'keyword_idf.df0_ratio', value: df0 / total },
    { name: 'keyword_idf.idf_min', value: Math.min(...idfs) },
    { name: 'keyword_idf.idf_max', value: Math.max(...idfs) },
    { name: 'keyword_idf.idf_avg', value: average(idfs) },
    { name: 'keyword_idf.idf_std', value: stddev(idfs) },
  ];
}

// ─── Persistence ───

async function persistMetrics(pool: Pool, metrics: readonly QualityMetric[]): Promise<void> {
  if (metrics.length === 0) return;
  const values: (string | number | object | null)[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const m of metrics) {
    placeholders.push(`($${i++}, $${i++}, $${i++})`);
    values.push(m.name, Number.isFinite(m.value) ? m.value : 0, m.dim ? JSON.stringify(m.dim) : null);
  }
  await pool.query(
    `INSERT INTO quality_metrics (metric_name, value, dim) VALUES ${placeholders.join(',')}`,
    values,
  );
}

// ─── Main entry ───

export interface QualityBatchResult {
  readonly metricsCount: number;
  readonly elapsedMs: number;
  readonly metrics: readonly QualityMetric[];
}

export async function runQualityMetricsBatch(pool: Pool): Promise<QualityBatchResult> {
  const start = Date.now();
  try {
    const members = await loadClusterMembers(pool);
    const issues = await loadIssueRows(pool);

    const clusterMetrics = computeClusterMetrics(members);
    const issueMetrics = await computeIssueMetrics(pool, issues);
    const idfMetrics = await computeKeywordIdfMetrics(pool);

    const all = [...clusterMetrics, ...issueMetrics, ...idfMetrics];
    await persistMetrics(pool, all);

    const elapsedMs = Date.now() - start;
    logger.info(
      { metricsCount: all.length, elapsedMs },
      '[qualityMetricsBatch] persisted',
    );
    return { metricsCount: all.length, elapsedMs, metrics: all };
  } catch (err) {
    logger.error({ err }, '[qualityMetricsBatch] failed');
    return { metricsCount: 0, elapsedMs: Date.now() - start, metrics: [] };
  }
}

/** Stale 메트릭 정리 — 7일 이상 된 행 삭제 */
export async function cleanStaleQualityMetrics(pool: Pool): Promise<number> {
  const result = await pool.query(
    `DELETE FROM quality_metrics WHERE computed_at < NOW() - INTERVAL '7 days'`,
  );
  return result.rowCount ?? 0;
}

/**
 * 최근 1 tick (10분 이내)에 산출된 특정 메트릭의 최신 값.
 * 알림 트리거에서 사용 — `cluster.size_over_50_count > 0` 같은 임계 검사.
 */
export async function getLatestMetric(pool: Pool, name: string): Promise<number | null> {
  const { rows } = await pool.query<{ value: number }>(
    `SELECT value FROM quality_metrics
     WHERE metric_name = $1 AND computed_at > NOW() - INTERVAL '15 minutes'
     ORDER BY computed_at DESC LIMIT 1`,
    [name],
  );
  return rows.length > 0 ? Number(rows[0].value) : null;
}
