import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';

interface SupabaseJwtPayload {
  sub: string;          // user UUID
  email?: string;
  role?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

function verifySupabaseJwt(token: string): SupabaseJwtPayload | null {
  if (!config.supabaseJwtSecret) return null;
  try {
    const payload = jwt.verify(token, config.supabaseJwtSecret, {
      algorithms: ['HS256'],
    }) as SupabaseJwtPayload;
    return payload;
  } catch {
    return null;
  }
}

/** Requires valid Supabase JWT. Returns 401 if missing/invalid. */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    reply.status(401).send({ error: '로그인이 필요합니다.' });
    return;
  }

  const payload = verifySupabaseJwt(token);
  if (!payload?.sub) {
    reply.status(401).send({ error: '유효하지 않은 인증 토큰입니다.' });
    return;
  }

  req.userId = payload.sub;
}

/** Parses JWT if present but does not reject anonymous requests. */
export async function optionalAuth(
  req: FastifyRequest,
): Promise<void> {
  const token = extractToken(req);
  if (!token) return;

  const payload = verifySupabaseJwt(token);
  if (payload?.sub) {
    req.userId = payload.sub;
  }
}
