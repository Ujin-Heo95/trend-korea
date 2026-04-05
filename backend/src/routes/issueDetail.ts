import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

const detailCache = new LRUCache<unknown>(200, 60_000);

export async function issueDetailRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { postId: string } }>('/api/posts/:postId', async (req, reply) => {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) return reply.status(400).send({ error: 'Invalid post ID' });

    const cacheKey = `issue-detail:${postId}`;
    const cached = detailCache.get(cacheKey);
    if (cached) return cached;

    // Q1-Q3 in parallel
    const [postResult, clusterResult, engagementResult] = await Promise.all([
      // Q1: Post + trend_score
      app.pg.query<{
        id: number; source_key: string; source_name: string; title: string; url: string;
        thumbnail: string | null; author: string | null; view_count: number; comment_count: number;
        published_at: string | null; first_scraped_at: string; scraped_at: string; category: string | null;
        metadata: Record<string, unknown> | null; trend_score: number | null;
      }>(
        `SELECT p.id, p.source_key, p.source_name, p.title, p.url, p.thumbnail,
                p.author, p.view_count, p.comment_count, p.vote_count, p.published_at, p.first_scraped_at, p.scraped_at,
                p.category, p.content_snippet, p.metadata, ps.trend_score
         FROM posts p
         LEFT JOIN post_scores ps ON ps.post_id = p.id
         WHERE p.id = $1`,
        [postId]
      ),

      // Q2: Cluster members
      app.pg.query<{
        id: number; source_key: string; source_name: string; title: string; url: string;
        view_count: number; comment_count: number; published_at: string | null;
      }>(
        `SELECT p.id, p.source_key, p.source_name, p.title, p.url,
                p.view_count, p.comment_count, p.published_at
         FROM post_cluster_members pcm
         JOIN posts p ON p.id = pcm.post_id
         WHERE pcm.cluster_id = (
           SELECT cluster_id FROM post_cluster_members WHERE post_id = $1 LIMIT 1
         ) AND pcm.post_id != $1
         ORDER BY p.view_count DESC`,
        [postId]
      ),

      // Q3: Engagement snapshots
      app.pg.query<{ view_count: number; comment_count: number; captured_at: string }>(
        `SELECT view_count, comment_count, captured_at
         FROM engagement_snapshots WHERE post_id = $1
         ORDER BY captured_at LIMIT 20`,
        [postId]
      ),
    ]);

    const post = postResult.rows[0];
    if (!post) return reply.status(404).send({ error: 'Post not found' });

    const { trend_score, ...postData } = post;

    // Q4: 같은 카테고리 인기글 (현재 포스트·클러스터 제외)
    const clusterMemberIds = clusterResult.rows.map(m => m.id);
    const excludeIds = [postId, ...clusterMemberIds];
    let categoryPopular: { id: number; title: string; source_name: string; source_key: string; thumbnail: string | null; view_count: number }[] = [];
    if (postData.category) {
      const { rows: popRows } = await app.pg.query<typeof categoryPopular[number]>(
        `SELECT p.id, p.title, p.source_name, p.source_key, p.thumbnail, p.view_count
         FROM posts p
         LEFT JOIN post_scores ps ON ps.post_id = p.id
         WHERE p.category = $1
           AND p.scraped_at > NOW() - INTERVAL '24 hours'
           AND p.id != ALL($2::int[])
         ORDER BY COALESCE(ps.trend_score, 0) DESC
         LIMIT 5`,
        [postData.category, excludeIds],
      );
      categoryPopular = popRows;
    }

    const result = {
      post: postData,
      trend_score,
      cluster_members: clusterResult.rows,
      engagement_history: engagementResult.rows,
      category_popular: categoryPopular,
    };

    detailCache.set(cacheKey, result);
    return result;
  });
}
