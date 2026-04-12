/**
 * /api/admin/quality — 품질 메트릭 조회 (Stage 1)
 *
 * - GET /api/admin/quality?metric=NAME&hours=24  — 시계열
 * - GET /api/admin/quality/summary               — 24h 핵심 메트릭 요약
 *
 * 인증: 기존 admin auth (`requireAdmin`) 사용.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAdmin } from '../middleware/adminAuth.js';

const SUMMARY_METRICS = [
  'cluster.cardinality_total',
  'cluster.size_p50',
  'cluster.size_p95',
  'cluster.size_p99',
  'cluster.size_max',
  'cluster.size_over_50_count',
  'cluster.singleton_ratio',
  'cluster.intra_cos_p50',
  'cluster.source_diversity_p50',
  'issue.total',
  'issue.score_nan_count',
  'issue.posts_per_issue_p50',
  'issue.posts_per_issue_p95',
  'issue.cross_topic_pairs_total',
  'issue.with_cross_topic_count',
  'issue.label_count_avg',
  'keyword_idf.total',
  'keyword_idf.coverage_pct',
  'keyword_idf.df0_ratio',
  'keyword_idf.idf_min',
  'keyword_idf.idf_max',
  'keyword_idf.idf_avg',
];

export async function adminQualityRoutes(app: FastifyInstance): Promise<void> {
  // 시계열 — 단일 메트릭의 최근 N시간 모든 포인트
  app.get<{ Querystring: { metric?: string; hours?: string } }>(
    '/api/admin/quality',
    async (req: FastifyRequest<{ Querystring: { metric?: string; hours?: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(req, reply)) return;
      const metric = req.query.metric;
      if (!metric) return reply.status(400).send({ error: 'metric query param required' });
      const hours = Math.max(1, Math.min(168, parseInt(req.query.hours ?? '24', 10) || 24));

      const { rows } = await app.pg.query<{ computed_at: Date; value: number }>(
        `SELECT computed_at, value
           FROM quality_metrics
          WHERE metric_name = $1
            AND computed_at > NOW() - make_interval(hours => $2)
          ORDER BY computed_at ASC`,
        [metric, hours],
      );
      return reply.send({
        metric,
        hours,
        points: rows.map(r => ({ t: r.computed_at, v: Number(r.value) })),
      });
    },
  );

  // 24h 핵심 메트릭 요약 — 각 메트릭의 최신값 + 24h min/max/avg
  app.get('/api/admin/quality/summary', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(req, reply)) return;

    const { rows } = await app.pg.query<{
      metric_name: string;
      latest: number;
      latest_at: Date;
      min_24h: number;
      max_24h: number;
      avg_24h: number;
      sample_count: number;
    }>(
      `WITH latest AS (
         SELECT DISTINCT ON (metric_name) metric_name, value AS latest, computed_at AS latest_at
           FROM quality_metrics
          WHERE metric_name = ANY($1::text[])
            AND computed_at > NOW() - INTERVAL '24 hours'
          ORDER BY metric_name, computed_at DESC
       ),
       agg AS (
         SELECT metric_name,
                MIN(value) AS min_24h,
                MAX(value) AS max_24h,
                AVG(value) AS avg_24h,
                COUNT(*)::int AS sample_count
           FROM quality_metrics
          WHERE metric_name = ANY($1::text[])
            AND computed_at > NOW() - INTERVAL '24 hours'
          GROUP BY metric_name
       )
       SELECT l.metric_name, l.latest, l.latest_at,
              a.min_24h, a.max_24h, a.avg_24h, a.sample_count
         FROM latest l JOIN agg a USING (metric_name)`,
      [SUMMARY_METRICS],
    );

    const byMetric: Record<string, unknown> = {};
    for (const r of rows) {
      byMetric[r.metric_name] = {
        latest: Number(r.latest),
        latest_at: r.latest_at,
        min_24h: Number(r.min_24h),
        max_24h: Number(r.max_24h),
        avg_24h: Number(r.avg_24h),
        sample_count: r.sample_count,
      };
    }
    return reply.send({ summary: byMetric, generated_at: new Date() });
  });
}
