import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

const keywordsCache = new LRUCache<unknown>(10, 5 * 60_000); // 5분 TTL

export async function keywordsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { window?: string } }>(
    '/api/keywords',
    async (req) => {
      const windowHours = req.query.window === '24' ? 24 : 3;
      const cacheKey = `keywords:${windowHours}`;

      const cached = keywordsCache.get(cacheKey);
      if (cached) return cached;

      const { rows } = await app.pg.query<{
        keyword: string;
        mention_count: number;
        rate: number;
        total_posts: number;
        calculated_at: string;
      }>(
        `SELECT keyword, mention_count, rate, total_posts, calculated_at
         FROM keyword_stats
         WHERE window_hours = $1
         ORDER BY mention_count DESC
         LIMIT 100`,
        [windowHours],
      );

      const calculatedAt = rows[0]?.calculated_at ?? null;
      const totalPosts = rows[0]?.total_posts ?? 0;

      const result = {
        keywords: rows.map((r, i) => ({
          rank: i + 1,
          keyword: r.keyword,
          count: r.mention_count,
          rate: Number(r.rate),
        })),
        totalPosts,
        window: windowHours,
        calculatedAt,
      };

      keywordsCache.set(cacheKey, result);
      return result;
    },
  );
}
