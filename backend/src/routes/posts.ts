import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

const postsCache = new LRUCache<unknown>(200, 60_000);

/** Batch-fetch keywords from keyword_extractions for given post IDs */
async function attachKeywords(pg: FastifyInstance['pg'], posts: any[]): Promise<void> {
  if (posts.length === 0) return;
  const ids = posts.map(p => p.id);
  const { rows } = await pg.query<{ post_id: number; keywords: string[] }>(
    `SELECT post_id, keywords FROM keyword_extractions WHERE post_id = ANY($1::int[])`,
    [ids],
  );
  const kwMap = new Map(rows.map(r => [r.post_id, r.keywords]));
  for (const post of posts) {
    post.keywords = kwMap.get(post.id) ?? [];
  }
}

export async function postsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { source?: string; category?: string; q?: string; page?: number; limit?: number; sort?: string } }>(
    '/api/posts',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
            category: { type: 'string' },
            source: { type: 'string' },
            q: { type: 'string', maxLength: 200 },
            sort: { type: 'string', enum: ['trending', 'latest', 'views'] },
          },
        },
      },
    },
    async (req) => {
      const { source, category, q, sort } = req.query;
      const limit  = req.query.limit ?? 30;
      const page   = req.query.page ?? 1;
      const offset = (page - 1) * limit;
      const isTrending = sort === 'trending';

      const sortedSource = source ? source.split(',').sort().join(',') : '';
      const cacheKey = `posts:${sortedSource}:${category ?? ''}:${q ?? ''}:${sort ?? ''}:${page}:${limit}`;
      const cached = postsCache.get(cacheKey);
      if (cached) return cached;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (source) {
        const sources = source.split(',').map(s => s.trim()).filter(Boolean);
        conditions.push(`p.source_key = ANY($${params.push(sources)}::text[])`);
      }
      if (category) {
        const cats = category.split(',').map(c => c.trim()).filter(Boolean);
        if (cats.length === 1) {
          conditions.push(`p.category = $${params.push(cats[0])}`);
        } else {
          conditions.push(`p.category = ANY($${params.push(cats)}::text[])`);
        }
      } else {
        conditions.push(`(p.category IS NULL OR p.category NOT IN ('movie', 'performance', 'video_popular'))`);
      }
      if (q) {
        const escapedQ = q.replace(/[%_\\]/g, '\\$&');
        conditions.push(`p.title ILIKE $${params.push(`%${escapedQ}%`)}`);
      }

      const whereParamCount = params.length;
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Over-fetch to compensate for cluster dedup filtering
      const fetchLimit = Math.ceil(limit * 1.5);

      const orderBy = isTrending
        ? 'COALESCE(ps.trend_score, 0) DESC'
        : 'p.scraped_at DESC';

      const [rows, count] = await Promise.all([
        app.pg.query(
          `SELECT p.id, p.source_key, p.source_name, p.title, p.url, p.thumbnail,
                  p.author, p.view_count, p.comment_count, p.vote_count, p.published_at, p.scraped_at, p.category, p.metadata, p.ai_summary
           FROM posts p
           LEFT JOIN post_scores ps ON ps.post_id = p.id
           ${where}
           ORDER BY ${orderBy}
           LIMIT $${params.push(fetchLimit)} OFFSET $${params.push(offset)}`,
          params
        ),
        app.pg.query(
          `SELECT COUNT(*)::int AS total FROM posts p ${where}`,
          params.slice(0, whereParamCount)
        ),
      ]);

      // Cluster dedup: collapse non-canonical cluster members
      const postIds = rows.rows.map((r: any) => r.id);
      const clusterInfo = postIds.length > 0
        ? await app.pg.query<{
            post_id: number; cluster_id: number; canonical_post_id: number;
            member_count: number;
          }>(
            `SELECT pcm.post_id, pcm.cluster_id, pc.canonical_post_id, pc.member_count
             FROM post_cluster_members pcm
             JOIN post_clusters pc ON pc.id = pcm.cluster_id
             WHERE pcm.post_id = ANY($1::int[])`,
            [postIds]
          )
        : { rows: [] };

      // Build lookup: postId → cluster info
      const clusterMap = new Map<number, { clusterId: number; canonicalId: number; memberCount: number }>();
      for (const ci of clusterInfo.rows) {
        clusterMap.set(ci.post_id, {
          clusterId: ci.cluster_id,
          canonicalId: ci.canonical_post_id,
          memberCount: ci.member_count,
        });
      }

      // Fetch related_sources for canonical posts in clusters
      const canonicalClusterIds = [...new Set(
        clusterInfo.rows
          .filter(ci => ci.canonical_post_id === ci.post_id)
          .map(ci => ci.cluster_id)
      )];

      const relatedMap = new Map<number, { id: number; source_name: string; source_key: string; url: string }[]>();
      if (canonicalClusterIds.length > 0) {
        const related = await app.pg.query<{
          cluster_id: number; id: number; source_name: string; source_key: string; url: string;
        }>(
          `SELECT pcm.cluster_id, p.id, p.source_name, p.source_key, p.url
           FROM post_cluster_members pcm
           JOIN posts p ON p.id = pcm.post_id
           JOIN post_clusters pc ON pc.id = pcm.cluster_id
           WHERE pcm.cluster_id = ANY($1::int[]) AND pcm.post_id != pc.canonical_post_id
           ORDER BY p.view_count DESC`,
          [canonicalClusterIds]
        );
        for (const r of related.rows) {
          const arr = relatedMap.get(r.cluster_id) ?? [];
          arr.push({ id: r.id, source_name: r.source_name, source_key: r.source_key, url: r.url });
          relatedMap.set(r.cluster_id, arr);
        }
      }

      // Filter: keep canonical or unclustered, skip non-canonical members
      const seenClusters = new Set<number>();
      const posts = [];
      for (const row of rows.rows as any[]) {
        const ci = clusterMap.get(row.id);
        if (ci) {
          if (row.id !== ci.canonicalId) continue; // skip non-canonical
          if (seenClusters.has(ci.clusterId)) continue;
          seenClusters.add(ci.clusterId);
          row.cluster_size = ci.memberCount;
          row.cluster_id = ci.clusterId;
          row.related_sources = relatedMap.get(ci.clusterId) ?? [];
        } else {
          row.cluster_size = 1;
          row.cluster_id = null;
        }
        posts.push(row);
        if (posts.length >= limit) break;
      }

      // 키워드 첨부
      await attachKeywords(app.pg, posts);

      // 영화/공연 카테고리: 최근 스크래핑 시각 포함
      let lastUpdated: string | null = null;
      if (category === 'movie' || category === 'performance') {
        const sourceKey = category === 'movie' ? 'kobis_boxoffice' : 'kopis_boxoffice';
        const luResult = await app.pg.query<{ last_updated: string }>(
          `SELECT MAX(finished_at)::text AS last_updated FROM scraper_runs
           WHERE source_key = $1 AND error_message IS NULL`,
          [sourceKey]
        );
        lastUpdated = luResult.rows[0]?.last_updated ?? null;
      }

      const result = { posts, total: count.rows[0].total, page, limit, lastUpdated };
      postsCache.set(cacheKey, result);
      return result;
    }
  );

  // Trending endpoint: top 20 by trend_score
  app.get('/api/posts/trending', async () => {
    const cached = postsCache.get('trending');
    if (cached) return cached;

    const r = await app.pg.query(
      `SELECT p.id, p.source_key, p.source_name, p.title, p.url, p.thumbnail,
              p.author, p.view_count, p.comment_count, p.vote_count, p.published_at,
              p.scraped_at, p.category, p.metadata, p.ai_summary, COALESCE(ps.trend_score, 0) AS trend_score
       FROM posts p
       LEFT JOIN post_scores ps ON ps.post_id = p.id
       WHERE p.scraped_at > NOW() - INTERVAL '6 hours'
       ORDER BY COALESCE(ps.trend_score, 0) DESC
       LIMIT 30`
    );

    // Cluster dedup for trending
    const postIds = r.rows.map((row: any) => row.id);
    const clusterInfo = postIds.length > 0
      ? await app.pg.query<{ post_id: number; canonical_post_id: number; member_count: number }>(
          `SELECT pcm.post_id, pc.canonical_post_id, pc.member_count
           FROM post_cluster_members pcm
           JOIN post_clusters pc ON pc.id = pcm.cluster_id
           WHERE pcm.post_id = ANY($1::int[])`,
          [postIds]
        )
      : { rows: [] };

    const clusterMap = new Map<number, { canonicalId: number; memberCount: number }>();
    for (const ci of clusterInfo.rows) {
      clusterMap.set(ci.post_id, { canonicalId: ci.canonical_post_id, memberCount: ci.member_count });
    }

    const seenClusters = new Set<number>();
    const posts = [];
    for (const row of r.rows as any[]) {
      const ci = clusterMap.get(row.id);
      if (ci) {
        if (row.id !== ci.canonicalId) continue;
        if (seenClusters.has(ci.canonicalId)) continue;
        seenClusters.add(ci.canonicalId);
        row.cluster_size = ci.memberCount;
      } else {
        row.cluster_size = 1;
      }
      posts.push(row);
      if (posts.length >= 20) break;
    }

    // 키워드 첨부
    await attachKeywords(app.pg, posts);

    const result = { posts };
    postsCache.set('trending', result);
    return result;
  });

  // Cluster detail: all members of a cluster
  app.get<{ Params: { clusterId: string } }>('/api/posts/cluster/:clusterId', async (req) => {
    const clusterId = parseInt(req.params.clusterId);
    if (isNaN(clusterId)) return { posts: [] };

    const r = await app.pg.query(
      `SELECT p.*, pcm.similarity_score, pcm.match_layer
       FROM post_cluster_members pcm
       JOIN posts p ON p.id = pcm.post_id
       WHERE pcm.cluster_id = $1
       ORDER BY p.view_count DESC`,
      [clusterId]
    );
    return { posts: r.rows };
  });
}
