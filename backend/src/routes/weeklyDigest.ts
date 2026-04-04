import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

const cache = new LRUCache<unknown>(5, 10 * 60_000); // 10분 TTL

export async function weeklyDigestRoutes(app: FastifyInstance): Promise<void> {
  // 최신 주간 다이제스트
  app.get('/api/weekly-digest/latest', async () => {
    const cacheKey = 'weekly-digest:latest';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const { rows } = await app.pg.query<{
      id: number;
      week_start: string;
      digest: string;
      top_keywords: string[];
      outlook: string | null;
      created_at: string;
    }>(
      `SELECT id, week_start::text, digest, top_keywords, outlook, created_at
       FROM weekly_digests
       ORDER BY week_start DESC
       LIMIT 1`,
    );

    const result = rows[0] ?? null;
    if (result) cache.set(cacheKey, result);
    return result;
  });

  // 특정 주차 다이제스트
  app.get<{ Params: { date: string } }>(
    '/api/weekly-digest/:date',
    async (req, reply) => {
      const dateStr = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return reply.status(400).send({ error: 'Invalid date format (YYYY-MM-DD)' });
      }

      const cacheKey = `weekly-digest:${dateStr}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const { rows } = await app.pg.query<{
        id: number;
        week_start: string;
        digest: string;
        top_keywords: string[];
        outlook: string | null;
        created_at: string;
      }>(
        `SELECT id, week_start::text, digest, top_keywords, outlook, created_at
         FROM weekly_digests
         WHERE week_start = $1
         LIMIT 1`,
        [dateStr],
      );

      const result = rows[0] ?? null;
      if (result) cache.set(cacheKey, result);
      return result;
    },
  );
}
