import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

interface TrendSignalRow {
  id: number;
  keyword: string;
  google_traffic: string | null;
  google_traffic_num: number;
  google_post_id: number | null;
  naver_recent: number | null;
  naver_previous: number | null;
  naver_change_pct: number | null;
  community_mentions: number;
  community_sources: string[];
  convergence_score: number;
  signal_type: string;
  detected_at: string;
}

const cache = new LRUCache<{ signals: TrendSignalRow[] }>(50, 60_000);

export async function trendSignalsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { type?: string };
  }>('/api/trends/signals', async (request, reply) => {
    const { type } = request.query;

    const cacheKey = `trend-signals:${type ?? 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached) return reply.send(cached);

    let query = `
      SELECT id, keyword, google_traffic, google_traffic_num, google_post_id,
             naver_recent, naver_previous, naver_change_pct,
             community_mentions, community_sources,
             convergence_score, signal_type, detected_at
      FROM trend_signals
      WHERE expires_at > NOW()
    `;
    const params: string[] = [];

    if (type && ['confirmed', 'google_only'].includes(type)) {
      params.push(type);
      query += ` AND signal_type = $${params.length}`;
    }

    query += ' ORDER BY convergence_score DESC LIMIT 30';

    const { rows } = await app.pg.query<TrendSignalRow>(query, params);
    const result = { signals: rows };

    cache.set(cacheKey, result);
    return reply.send(result);
  });
}
