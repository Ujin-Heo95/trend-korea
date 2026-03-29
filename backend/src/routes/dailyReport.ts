import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

const cache = new LRUCache<unknown>(30, 5 * 60_000); // 30 entries, 5min TTL

export async function dailyReportRoutes(app: FastifyInstance): Promise<void> {
  // 최신 리포트 메타
  app.get('/api/daily-report/latest', async () => {
    const cached = cache.get('latest');
    if (cached) return cached;

    const { rows } = await app.pg.query(
      `SELECT id, report_date, generated_at, status, view_count
       FROM daily_reports
       WHERE status = 'published'
       ORDER BY report_date DESC
       LIMIT 1`,
    );

    const result = rows[0] ?? null;
    if (result) cache.set('latest', result);
    return result;
  });

  // 특정 날짜 리포트 상세
  app.get<{ Params: { date: string } }>(
    '/api/daily-report/:date',
    async (req, reply) => {
      const { date } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.status(400).send({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      }

      const cacheKey = `report:${date}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const { rows: [report] } = await app.pg.query(
        `SELECT id, report_date, generated_at, status, view_count
         FROM daily_reports
         WHERE report_date = $1 AND status = 'published'`,
        [date],
      );

      if (!report) {
        return reply.status(404).send({ error: 'Report not found' });
      }

      // view_count 증가 (fire-and-forget)
      Promise.resolve(
        app.pg.query(
          'UPDATE daily_reports SET view_count = view_count + 1 WHERE id = $1',
          [report.id],
        ),
      ).catch(() => {});

      const { rows: sections } = await app.pg.query(
        `SELECT category, rank, summary, category_summary,
                post_id, title, url, source_name,
                view_count, comment_count, cluster_size
         FROM daily_report_sections
         WHERE report_id = $1
         ORDER BY category, rank`,
        [report.id],
      );

      const result = { ...report, sections };
      cache.set(cacheKey, result);
      return result;
    },
  );
}
