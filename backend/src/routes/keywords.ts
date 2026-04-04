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
        burst_explanation: string | null;
        z_score: number | null;
        dominant_tone: string | null;
      }>(
        `SELECT ks.keyword, ks.mention_count, ks.rate, ks.total_posts, ks.calculated_at,
                kbe.explanation AS burst_explanation, kbe.z_score, ks.dominant_tone
         FROM keyword_stats ks
         LEFT JOIN keyword_burst_explanations kbe
           ON kbe.keyword = ks.keyword AND kbe.expires_at > NOW()
         WHERE ks.window_hours = $1
         ORDER BY ks.mention_count DESC
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
          burstExplanation: r.burst_explanation ?? undefined,
          zScore: r.z_score != null ? Number(r.z_score) : undefined,
          tone: r.dominant_tone ?? undefined,
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
