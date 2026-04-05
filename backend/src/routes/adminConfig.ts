import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAdmin } from '../middleware/adminAuth.js';
import { getScoringConfig } from '../services/scoringConfig.js';

export async function adminConfigRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/admin/config — 전체 그룹 목록
  app.get('/api/admin/config', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(req, reply)) return;
    const config = getScoringConfig();
    return reply.send({ groups: config.listGroups() });
  });

  // GET /api/admin/config/:group — 그룹 상세 (현재값 + 기본값 + 검증 규칙)
  app.get<{ Params: { group: string } }>(
    '/api/admin/config/:group',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const detail = await getScoringConfig().getGroupDetail(req.params.group);
      if (!detail) return reply.status(404).send({ error: 'Unknown config group' });
      return reply.send(detail);
    },
  );

  // PUT /api/admin/config/:group — 그룹 값 저장
  app.put<{ Params: { group: string }; Body: { values: Record<string, unknown> } }>(
    '/api/admin/config/:group',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { group } = req.params;
      const body = req.body as { values?: Record<string, unknown> };
      if (!body?.values || typeof body.values !== 'object') {
        return reply.status(400).send({ error: 'values 객체가 필요합니다' });
      }

      try {
        const errors = await getScoringConfig().saveGroup(group, body.values);
        if (errors.length > 0) {
          return reply.status(400).send({ error: '검증 실패', details: errors });
        }
        return reply.send({ ok: true });
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Unknown config group')) {
          return reply.status(404).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // POST /api/admin/config/:group/reset — 그룹 기본값 복원
  app.post<{ Params: { group: string } }>(
    '/api/admin/config/:group/reset',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      try {
        await getScoringConfig().resetGroup(req.params.group);
        return reply.send({ ok: true });
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Unknown config group')) {
          return reply.status(404).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}
