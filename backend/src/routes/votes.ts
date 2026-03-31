import { createHash } from 'crypto';
import type { FastifyInstance } from 'fastify';

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export async function votesRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/posts/:postId/vote — upvote a post (IP-deduplicated)
  app.post<{ Params: { postId: string } }>(
    '/api/posts/:postId/vote',
    async (req, reply) => {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) return reply.status(400).send({ error: 'Invalid post ID' });

      const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
        ?? req.ip
        ?? 'unknown';
      const ipHash = hashIp(clientIp);

      // Atomic: insert vote if not duplicate, then conditionally increment
      const result = await app.pg.query<{ inserted: boolean }>(
        `WITH ins AS (
           INSERT INTO post_votes (post_id, ip_hash)
           VALUES ($1, $2)
           ON CONFLICT (post_id, ip_hash) DO NOTHING
           RETURNING 1
         )
         SELECT EXISTS(SELECT 1 FROM ins) AS inserted`,
        [postId, ipHash]
      );

      const inserted = result.rows[0]?.inserted ?? false;

      if (inserted) {
        await app.pg.query(
          `UPDATE posts SET vote_count = vote_count + 1 WHERE id = $1`,
          [postId]
        );
      }

      const countResult = await app.pg.query<{ vote_count: number }>(
        `SELECT vote_count FROM posts WHERE id = $1`,
        [postId]
      );

      return {
        vote_count: countResult.rows[0]?.vote_count ?? 0,
        voted: !inserted ? true : true, // always true after voting
        already_voted: !inserted,
      };
    }
  );
}
