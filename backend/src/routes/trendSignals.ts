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
  naver_trend_data: { period: string; ratio: number }[] | null;
  community_mentions: number;
  community_sources: string[];
  convergence_score: number;
  signal_type: string;
  detected_at: string;
  context_title: string | null;
  related_post_ids: number[];
}

interface GoogleArticle {
  title: string;
  url: string;
  source: string;
}

interface RelatedPost {
  id: number;
  title: string;
  url: string;
  source_name: string;
  source_key: string;
  thumbnail: string | null;
  published_at: string | null;
}

interface PostRow {
  id: number;
  title: string;
  url: string;
  source_name: string;
  source_key: string;
  thumbnail: string | null;
  published_at: string | null;
  metadata: { articles?: GoogleArticle[] } | null;
}

type SignalResponse = Omit<TrendSignalRow, 'related_post_ids'> & {
  google_articles: GoogleArticle[];
  related_posts: RelatedPost[];
};

const cache = new LRUCache<{ signals: SignalResponse[] }>(50, 60_000);

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
             naver_recent, naver_previous, naver_change_pct, naver_trend_data,
             community_mentions, community_sources,
             convergence_score, signal_type, detected_at,
             context_title, related_post_ids
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

    // Batch resolve: google_post_ids + related_post_ids → posts
    const allGooglePostIds = rows
      .map(r => r.google_post_id)
      .filter((id): id is number => id !== null);
    const allRelatedPostIds = rows.flatMap(r => r.related_post_ids ?? []);
    const allPostIds = [...new Set([...allGooglePostIds, ...allRelatedPostIds])];

    const postMap = new Map<number, PostRow>();
    if (allPostIds.length > 0) {
      const { rows: posts } = await app.pg.query<PostRow>(
        `SELECT id, title, url, source_name, source_key, thumbnail, published_at, metadata
         FROM posts WHERE id = ANY($1)`,
        [allPostIds],
      );
      for (const p of posts) postMap.set(p.id, p);
    }

    // Build response with resolved posts + google articles
    const signals: SignalResponse[] = rows.map(row => {
      // Extract google articles from the original Google Trends post metadata
      const googlePost = row.google_post_id ? postMap.get(row.google_post_id) : null;
      const googleArticles: GoogleArticle[] = googlePost?.metadata?.articles ?? [];

      // Resolve related community/keyword posts
      const relatedPosts: RelatedPost[] = (row.related_post_ids ?? [])
        .map(id => postMap.get(id))
        .filter((p): p is PostRow => p !== undefined)
        .map(p => ({
          id: p.id,
          title: p.title,
          url: p.url,
          source_name: p.source_name,
          source_key: p.source_key,
          thumbnail: p.thumbnail,
          published_at: p.published_at,
        }));

      const { related_post_ids: _, ...rest } = row;
      return {
        ...rest,
        google_articles: googleArticles,
        related_posts: relatedPosts,
      };
    });

    const result = { signals };
    cache.set(cacheKey, result);
    return reply.send(result);
  });
}
