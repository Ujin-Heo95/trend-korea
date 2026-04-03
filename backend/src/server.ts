import { resolve, join } from 'path';
import { existsSync } from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import * as Sentry from '@sentry/node';
import { Pool } from 'pg';
import { config } from './config/index.js';
import { pool } from './db/client.js';
import { postsRoutes } from './routes/posts.js';
import { sourcesRoutes } from './routes/sources.js';
import { healthRoutes } from './routes/health.js';
import { dailyReportRoutes } from './routes/dailyReport.js';
import { weatherRoutes } from './routes/weather.js';
import { keywordsRoutes } from './routes/keywords.js';
import { trendSignalsRoutes } from './routes/trendSignals.js';
import { issueDetailRoutes } from './routes/issueDetail.js';
import { votesRoutes } from './routes/votes.js';
import { topicsRoutes } from './routes/topics.js';
import { sitemapRoutes } from './routes/sitemap.js';
import { startScheduler } from './scheduler/index.js';
import { registerPrerender } from './middleware/prerender.js';

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV ?? 'development',
  });
  console.log('[sentry] initialized');
}

declare module 'fastify' { interface FastifyInstance { pg: Pool; } }

export async function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });
  app.decorate('pg', pool);
  await app.register(cors, { origin: config.corsOrigin });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://pagead2.googlesyndication.com", "https://cloud.umami.is", "https://t1.kakaocdn.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://cloud.umami.is", "https://pagead2.googlesyndication.com"],
        frameSrc: ["https://pagead2.googlesyndication.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/health',
  });
  await app.register(postsRoutes);
  await app.register(sourcesRoutes);
  await app.register(healthRoutes);
  await app.register(dailyReportRoutes);
  await app.register(weatherRoutes);
  await app.register(keywordsRoutes);
  await app.register(trendSignalsRoutes);
  await app.register(issueDetailRoutes);
  await app.register(votesRoutes);
  await app.register(topicsRoutes);
  await app.register(sitemapRoutes);

  // 봇 프리렌더: API 이외의 봇 요청에 동적 meta 태그 HTML 반환
  registerPrerender(app, pool);

  // SPA 정적 파일 서빙 (프론트엔드 빌드 결과물이 존재할 때 + 테스트 환경 제외)
  const frontendDist = resolve(import.meta.dirname, '../../frontend/dist');
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  if (!isTest && existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      wildcard: false,
      serve: false,  // 자동 서빙 비활성화 — setNotFoundHandler에서 직접 처리
    });
    // SPA fallback: API·sitemap 이외의 모든 GET → 정적 파일 또는 index.html
    app.setNotFoundHandler(async (req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        // 정적 파일 먼저 시도, 없으면 index.html (SPA)
        try {
          return await reply.sendFile(req.url === '/' ? 'index.html' : req.url.slice(1));
        } catch {
          return reply.sendFile('index.html');
        }
      }
      return reply.status(404).send({ error: 'Not Found' });
    });
    console.log(`[server] serving frontend from ${frontendDist}`);
  }

  app.addHook('onError', (_req, _reply, error, done) => {
    if (config.sentryDsn) Sentry.captureException(error);
    done();
  });

  return app;
}

const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  const app = await buildApp();
  startScheduler();
  await app.listen({ port: config.port, host: '0.0.0.0' });

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received — shutting down gracefully`);
    await app.close();
    await pool.end();
    if (config.sentryDsn) await Sentry.close(2000);
    console.log('[server] shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
