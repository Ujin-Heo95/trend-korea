import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';

/** 요청이 어드민 인증 토큰을 가지고 있는지 확인 */
export function isAdminRequest(req: FastifyRequest): boolean {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const isProduction = config.nodeEnv === 'production';
  // 개발환경에서 ADMIN_TOKEN 미설정 시 허용
  if (!isProduction && config.adminToken === '') return true;
  return token !== '' && token === config.adminToken;
}

/** 어드민이 아니면 401 반환, 통과 시 true */
export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!isAdminRequest(req)) {
    reply.status(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}
