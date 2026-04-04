import type { FastifyInstance } from 'fastify';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  depth: number;
  vote_score: number;
  upvotes: number;
  downvotes: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  nickname: string;
  avatar_url: string | null;
  user_vote: number | null;
}

interface CreateCommentBody {
  body: string;
  parent_id?: number;
}

interface VoteBody {
  vote_type: number;
}

const MAX_DEPTH = 5;
const MAX_BODY_LENGTH = 2000;

export async function commentsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/posts/:postId/comments — Fetch comment tree
  app.get<{ Params: { postId: number }; Querystring: { sort?: string } }>(
    '/api/posts/:postId/comments',
    {
      preHandler: optionalAuth,
      schema: {
        params: {
          type: 'object',
          required: ['postId'],
          properties: { postId: { type: 'integer', minimum: 1 } },
        },
        querystring: {
          type: 'object',
          properties: { sort: { type: 'string', enum: ['best', 'new', 'old'] } },
        },
      },
    },
    async (req) => {
      const { postId } = req.params;
      const sort = req.query.sort ?? 'best';
      const userId = req.userId ?? null;

      const orderClause =
        sort === 'new' ? 'c.created_at DESC' :
        sort === 'old' ? 'c.created_at ASC' :
        'c.vote_score DESC, c.created_at ASC';

      const result = await app.pg.query<CommentRow>(
        `SELECT
           c.id, c.post_id, c.user_id, c.parent_id,
           CASE WHEN c.is_deleted THEN '[삭제된 댓글입니다]' ELSE c.body END AS body,
           c.depth, c.vote_score, c.upvotes, c.downvotes,
           c.is_deleted, c.created_at, c.updated_at,
           up.nickname, up.avatar_url,
           cv.vote_type AS user_vote
         FROM comments c
         JOIN user_profiles up ON up.id = c.user_id
         LEFT JOIN comment_votes cv ON cv.comment_id = c.id AND cv.user_id = $2
         WHERE c.post_id = $1
         ORDER BY c.depth ASC, ${orderClause}`,
        [postId, userId],
      );

      // Build tree structure in application layer
      return { comments: buildCommentTree(result.rows), total: result.rows.length };
    },
  );

  // POST /api/posts/:postId/comments — Create comment
  app.post<{ Params: { postId: number }; Body: CreateCommentBody }>(
    '/api/posts/:postId/comments',
    {
      preHandler: requireAuth,
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
      schema: {
        params: {
          type: 'object',
          required: ['postId'],
          properties: { postId: { type: 'integer', minimum: 1 } },
        },
        body: {
          type: 'object',
          required: ['body'],
          properties: {
            body: { type: 'string', minLength: 1, maxLength: MAX_BODY_LENGTH },
            parent_id: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.userId!;
      const { postId } = req.params;
      const { body, parent_id } = req.body;

      // Check if user is banned
      const userResult = await app.pg.query<{ is_banned: boolean }>(
        'SELECT is_banned FROM user_profiles WHERE id = $1',
        [userId],
      );
      if (userResult.rows[0]?.is_banned) {
        return reply.status(403).send({ error: '차단된 사용자입니다.' });
      }

      // Verify post exists
      const postExists = await app.pg.query(
        'SELECT 1 FROM posts WHERE id = $1',
        [postId],
      );
      if (postExists.rows.length === 0) {
        return reply.status(404).send({ error: '게시글을 찾을 수 없습니다.' });
      }

      // Calculate depth from parent
      let depth = 0;
      if (parent_id) {
        const parentResult = await app.pg.query<{ depth: number; post_id: string }>(
          'SELECT depth, post_id FROM comments WHERE id = $1',
          [parent_id],
        );
        if (parentResult.rows.length === 0) {
          return reply.status(404).send({ error: '부모 댓글을 찾을 수 없습니다.' });
        }
        if (String(parentResult.rows[0].post_id) !== String(postId)) {
          return reply.status(400).send({ error: '잘못된 부모 댓글입니다.' });
        }
        depth = parentResult.rows[0].depth + 1;
        if (depth > MAX_DEPTH) {
          return reply.status(400).send({ error: `최대 ${MAX_DEPTH}단계까지 답글을 달 수 있습니다.` });
        }
      }

      const result = await app.pg.query<CommentRow>(
        `INSERT INTO comments (post_id, user_id, parent_id, body, depth)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [postId, userId, parent_id ?? null, body, depth],
      );

      return reply.status(201).send(result.rows[0]);
    },
  );

  // PUT /api/comments/:commentId — Edit comment (owner only)
  app.put<{ Params: { commentId: number }; Body: { body: string } }>(
    '/api/comments/:commentId',
    {
      preHandler: requireAuth,
      schema: {
        params: {
          type: 'object',
          required: ['commentId'],
          properties: { commentId: { type: 'integer', minimum: 1 } },
        },
        body: {
          type: 'object',
          required: ['body'],
          properties: {
            body: { type: 'string', minLength: 1, maxLength: MAX_BODY_LENGTH },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.userId!;
      const { commentId } = req.params;
      const { body } = req.body;

      const result = await app.pg.query<CommentRow>(
        `UPDATE comments SET body = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
         RETURNING *`,
        [body, commentId, userId],
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: '댓글을 찾을 수 없거나 수정 권한이 없습니다.' });
      }

      return result.rows[0];
    },
  );

  // DELETE /api/comments/:commentId — Soft-delete (owner or admin)
  app.delete<{ Params: { commentId: number } }>(
    '/api/comments/:commentId',
    {
      preHandler: requireAuth,
      schema: {
        params: {
          type: 'object',
          required: ['commentId'],
          properties: { commentId: { type: 'integer', minimum: 1 } },
        },
      },
    },
    async (req, reply) => {
      const userId = req.userId!;

      const result = await app.pg.query(
        `UPDATE comments SET is_deleted = TRUE, body = '', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
         RETURNING id`,
        [req.params.commentId, userId],
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: '댓글을 찾을 수 없거나 삭제 권한이 없습니다.' });
      }

      return { deleted: true };
    },
  );

  // POST /api/comments/:commentId/vote — Upvote or downvote
  app.post<{ Params: { commentId: number }; Body: VoteBody }>(
    '/api/comments/:commentId/vote',
    {
      preHandler: requireAuth,
      config: {
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
      schema: {
        params: {
          type: 'object',
          required: ['commentId'],
          properties: { commentId: { type: 'integer', minimum: 1 } },
        },
        body: {
          type: 'object',
          required: ['vote_type'],
          properties: {
            vote_type: { type: 'integer', enum: [-1, 1] },
          },
        },
      },
    },
    async (req) => {
      const userId = req.userId!;
      const { commentId } = req.params;
      const { vote_type } = req.body;

      // Upsert vote
      const voteResult = await app.pg.query<{ old_vote: number | null }>(
        `WITH old AS (
           SELECT vote_type FROM comment_votes
           WHERE comment_id = $1 AND user_id = $2
         ),
         upsert AS (
           INSERT INTO comment_votes (comment_id, user_id, vote_type)
           VALUES ($1, $2, $3)
           ON CONFLICT (comment_id, user_id) DO UPDATE SET vote_type = $3
           RETURNING 1
         )
         SELECT (SELECT vote_type FROM old) AS old_vote`,
        [commentId, userId, vote_type],
      );

      const oldVote = voteResult.rows[0]?.old_vote ?? null;

      // Update comment score atomically
      // If changing vote: remove old, add new. If new vote: just add.
      const delta = oldVote === null
        ? vote_type
        : vote_type - oldVote;

      if (delta !== 0) {
        const upDelta = vote_type === 1 ? (oldVote === 1 ? 0 : 1) : (oldVote === 1 ? -1 : 0);
        const downDelta = vote_type === -1 ? (oldVote === -1 ? 0 : 1) : (oldVote === -1 ? -1 : 0);

        await app.pg.query(
          `UPDATE comments
           SET vote_score = vote_score + $2,
               upvotes = upvotes + $3,
               downvotes = downvotes + $4
           WHERE id = $1`,
          [commentId, delta, upDelta, downDelta],
        );
      }

      const scoreResult = await app.pg.query<{ vote_score: number; upvotes: number; downvotes: number }>(
        'SELECT vote_score, upvotes, downvotes FROM comments WHERE id = $1',
        [commentId],
      );

      return {
        vote_score: scoreResult.rows[0]?.vote_score ?? 0,
        upvotes: scoreResult.rows[0]?.upvotes ?? 0,
        downvotes: scoreResult.rows[0]?.downvotes ?? 0,
        user_vote: vote_type,
      };
    },
  );
}

/** Builds a nested comment tree from flat rows. */
function buildCommentTree(rows: CommentRow[]): (CommentRow & { children: CommentRow[] })[] {
  const map = new Map<string, CommentRow & { children: CommentRow[] }>();
  const roots: (CommentRow & { children: CommentRow[] })[] = [];

  for (const row of rows) {
    map.set(String(row.id), { ...row, children: [] });
  }

  for (const row of rows) {
    const node = map.get(String(row.id))!;
    if (row.parent_id) {
      const parent = map.get(String(row.parent_id));
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}
