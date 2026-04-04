import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';

interface ProfileBody {
  nickname: string;
  avatar_url?: string;
}

interface UserProfile {
  id: string;
  nickname: string;
  avatar_url: string | null;
  karma: number;
  is_banned: boolean;
  created_at: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/profile — Create or update user profile after first login
  app.post<{ Body: ProfileBody }>(
    '/api/auth/profile',
    {
      preHandler: requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['nickname'],
          properties: {
            nickname: { type: 'string', minLength: 2, maxLength: 30 },
            avatar_url: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.userId!;
      const { nickname, avatar_url } = req.body;

      // Check nickname uniqueness (case-insensitive)
      const existing = await app.pg.query<{ id: string }>(
        `SELECT id FROM user_profiles WHERE LOWER(nickname) = LOWER($1) AND id != $2`,
        [nickname, userId],
      );
      if (existing.rows.length > 0) {
        return reply.status(409).send({ error: '이미 사용 중인 닉네임입니다.' });
      }

      const result = await app.pg.query<UserProfile>(
        `INSERT INTO user_profiles (id, nickname, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           nickname = EXCLUDED.nickname,
           avatar_url = EXCLUDED.avatar_url,
           updated_at = NOW()
         RETURNING id, nickname, avatar_url, karma, is_banned, created_at`,
        [userId, nickname, avatar_url ?? null],
      );

      return result.rows[0];
    },
  );

  // GET /api/auth/me — Get current user's profile
  app.get(
    '/api/auth/me',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.userId!;

      const result = await app.pg.query<UserProfile>(
        `SELECT id, nickname, avatar_url, karma, is_banned, created_at
         FROM user_profiles WHERE id = $1`,
        [userId],
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: '프로필을 먼저 생성해주세요.' });
      }

      return result.rows[0];
    },
  );

  // GET /api/users/:userId — Get public profile
  app.get<{ Params: { userId: string } }>(
    '/api/users/:userId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (req, reply) => {
      const { userId } = req.params;

      const result = await app.pg.query<Omit<UserProfile, 'is_banned'>>(
        `SELECT id, nickname, avatar_url, karma, created_at
         FROM user_profiles WHERE id = $1 AND is_banned = FALSE`,
        [userId],
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: '사용자를 찾을 수 없습니다.' });
      }

      return result.rows[0];
    },
  );
}
