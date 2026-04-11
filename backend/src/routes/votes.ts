import { createHash } from 'crypto';
import type { FastifyInstance } from 'fastify';

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export async function votesRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/posts/:postId/vote — upvote a post (IP-deduplicated)
  app.post<{ Params: { postId: number } }>(
    '/api/posts/:postId/vote',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
      schema: {
        params: {
          type: 'object',
          required: ['postId'],
          properties: {
            postId: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    async (req) => {
      const postId = req.params.postId;

      const ipHash = hashIp(req.ip);

      // Single atomic CTE: insert vote → conditionally increment → return count
      const { rows } = await app.pg.query<{ vote_count: number; is_new_vote: boolean }>(
        `WITH ins AS (
           INSERT INTO post_votes (post_id, ip_hash)
           VALUES ($1, $2)
           ON CONFLICT (post_id, ip_hash) DO NOTHING
           RETURNING 1
         ),
         upd AS (
           UPDATE posts SET vote_count = vote_count + (SELECT COUNT(*)::int FROM ins)
           WHERE id = $1
           RETURNING vote_count
         )
         SELECT
           COALESCE((SELECT vote_count FROM upd), (SELECT vote_count FROM posts WHERE id = $1)) AS vote_count,
           EXISTS(SELECT 1 FROM ins) AS is_new_vote`,
        [postId, ipHash]
      );

      return {
        vote_count: rows[0]?.vote_count ?? 0,
        is_new_vote: rows[0]?.is_new_vote ?? false,
      };
    }
  );
}
