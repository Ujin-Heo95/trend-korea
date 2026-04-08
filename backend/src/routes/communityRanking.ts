import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

const rankingCache = new LRUCache<unknown>(10, 5 * 60_000);

export async function communityRankingRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { period?: string } }>(
    '/api/community-ranking',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['today', '7d', '30d'], default: 'today' },
          },
        },
      },
    },
    async (req) => {
      const period = req.query.period ?? 'today';

      const cacheKey = `community-ranking:${period}`;
      const cached = rankingCache.get(cacheKey);
      if (cached) return cached;

      const intervalMap: Record<string, string> = {
        today: '1 day',
        '7d': '7 days',
        '30d': '30 days',
      };
      const interval = intervalMap[period] ?? '1 day';

      const { rows } = await app.pg.query<{
        source_key: string;
        source_name: string;
        post_count: string;
        total_views: string;
        total_comments: string;
        total_likes: string;
        avg_views: string;
        avg_comments: string;
        avg_likes: string;
        score: string;
      }>(`
        SELECT
          p.source_key,
          p.source_name,
          COUNT(*)::text AS post_count,
          COALESCE(SUM(p.view_count), 0)::text AS total_views,
          COALESCE(SUM(p.comment_count), 0)::text AS total_comments,
          COALESCE(SUM(p.like_count), 0)::text AS total_likes,
          ROUND(COALESCE(AVG(NULLIF(p.view_count, 0)), 0))::text AS avg_views,
          ROUND(COALESCE(AVG(NULLIF(p.comment_count, 0)), 0))::text AS avg_comments,
          ROUND(COALESCE(AVG(NULLIF(p.like_count, 0)), 0))::text AS avg_likes,
          ROUND(
            COALESCE(AVG(NULLIF(p.view_count, 0)), 0) * 0.4
            + COALESCE(AVG(NULLIF(p.comment_count, 0)), 0) * 100 * 0.35
            + COALESCE(AVG(NULLIF(p.like_count, 0)), 0) * 50 * 0.25
          )::text AS score
        FROM posts p
        WHERE p.category = 'community'
          AND p.scraped_at >= NOW() - $1::interval
        GROUP BY p.source_key, p.source_name
        ORDER BY score DESC
      `, [interval]);

      const rankings = rows.map((r, i) => ({
        rank: i + 1,
        sourceKey: r.source_key,
        sourceName: r.source_name,
        postCount: parseInt(r.post_count),
        totalViews: parseInt(r.total_views),
        totalComments: parseInt(r.total_comments),
        totalLikes: parseInt(r.total_likes),
        avgViews: parseInt(r.avg_views),
        avgComments: parseInt(r.avg_comments),
        avgLikes: parseInt(r.avg_likes),
        score: parseFloat(r.score),
      }));

      const result = { rankings, period, updatedAt: new Date().toISOString() };
      rankingCache.set(cacheKey, result);
      return result;
    },
  );
}
