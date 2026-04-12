import { resolve, join } from 'path';
import { existsSync } from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import * as Sentry from '@sentry/node';
import { Pool } from 'pg';
import { config } from './config/index.js';
import { pool, validateConnection, gracefulShutdown } from './db/client.js';
import { postsRoutes } from './routes/posts.js';
import { sourcesRoutes } from './routes/sources.js';
import { healthRoutes } from './routes/health.js';
import { weatherRoutes } from './routes/weather.js';
import { issueDetailRoutes } from './routes/issueDetail.js';
import { ogImageRoutes } from './routes/ogImage.js';
import { votesRoutes } from './routes/votes.js';
import { sitemapRoutes } from './routes/sitemap.js';
import { feedRoutes } from './routes/feed.js';
import { issueRoutes } from './routes/issues.js';
import { issueRankingDetailRoutes } from './routes/issueRankingDetail.js';
import { adminConfigRoutes } from './routes/adminConfig.js';
import { adminScraperRoutes } from './routes/adminScrapers.js';
import { communityRankingRoutes } from './routes/communityRanking.js';
import { entertainmentUnifiedRoutes } from './routes/entertainmentUnified.js';
import { prerenderRoutes } from './routes/prerender.js';
import { debugIssueMergeRoutes } from './routes/debugIssueMerge.js';
import { adminQualityRoutes } from './routes/adminQuality.js';
import { startScheduler } from './scheduler/index.js';
import { startWebWatchdog } from './scheduler/watchdog.js';
import { awaitRunningScrapers } from './scrapers/index.js';
import { registerPrerender } from './middleware/prerender.js';
import { initScoringConfig } from './services/scoringConfig.js';

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    tracesSampleRate: 0.1,
    environment: config.nodeEnv,
  });
  console.log('[sentry] initialized');
}

// ── Process-level error handlers ─────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
  if (config.sentryDsn) Sentry.captureException(reason);
});

process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err);
  if (config.sentryDsn) Sentry.captureException(err);
  setTimeout(() => process.exit(1), 3000);
});

declare module 'fastify' { interface FastifyInstance { pg: Pool; } }

export async function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });
  app.decorate('pg', pool);
  try {
    initScoringConfig(pool);
  } catch (err) {
    console.error('[server] initScoringConfig failed, will use defaults:', err);
  }

  // ── Central Error Handler ────────────────────────────
  app.setErrorHandler((error: Error & { statusCode?: number; validation?: unknown }, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const isProduction = config.nodeEnv === 'production';

    // Log with Sentry if configured
    if (config.sentryDsn && statusCode >= 500) {
      Sentry.captureException(error);
    }

    // Log server errors
    if (statusCode >= 500) {
      request.log.error({ err: error, url: request.url }, 'server error');
    }

    // Fastify validation errors (400)
    if (error.validation) {
      return reply.status(400).send({
        error: error.message,
        statusCode: 400,
      });
    }

    return reply.status(statusCode).send({
      error: isProduction && statusCode >= 500 ? 'Internal Server Error' : error.message,
      statusCode,
    });
  });

  await app.register(cors, { origin: config.corsOrigin });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://pagead2.googlesyndication.com", "https://www.googletagservices.com", "https://adservice.google.com", "https://cloud.umami.is", "https://t1.kakaocdn.net", "https://t1.daumcdn.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://cloud.umami.is", "https://pagead2.googlesyndication.com", "https://www.googletagservices.com", "https://adservice.google.com", "https://t1.daumcdn.net"],
        frameSrc: ["https://pagead2.googlesyndication.com", "https://tpc.googlesyndication.com", "https://www.google.com", "https://ad.kakaocdn.net"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(compress, { global: true });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/health',
  });

  // ── Cache-Control 헤더: 라우트별 CDN/브라우저 캐시 정책 ──
  app.addHook('onSend', (_req, reply, payload, done) => {
    if (reply.hasHeader('cache-control')) { done(null, payload); return; }
    const url = _req.url;
    const method = _req.method;
    if (method !== 'GET' && method !== 'HEAD') {
      reply.header('cache-control', 'no-cache, no-store');
    } else if (url === '/health') {
      reply.header('cache-control', 'no-cache');
    } else if (url.startsWith('/api/sources')) {
      reply.header('cache-control', 'public, max-age=300, s-maxage=600');
    } else if (url.startsWith('/api/issues')) {
      // 신선도 우선: 종합 탭은 10분 tick 후 즉시 반영돼야 함. CDN/브라우저 캐시는
      // 5번 재발한 stale 사고의 직접 원인이므로 명시적으로 끔. /api/issues/version 폴링이
      // 변경 감지를 담당하고, freshness 메타가 사용자 측 자동 invalidate 를 트리거함.
      reply.header('cache-control', 'no-cache, no-store, must-revalidate');
    } else if (url.startsWith('/api/posts')) {
      reply.header('cache-control', 'no-cache, no-store, must-revalidate');
    } else if (url.startsWith('/api/og/') || url.startsWith('/api/sitemap')) {
      reply.header('cache-control', 'public, max-age=3600');
    } else if (url.startsWith('/api/')) {
      reply.header('cache-control', 'public, max-age=60, s-maxage=120');
    }
    done(null, payload);
  });
  await app.register(postsRoutes);
  await app.register(sourcesRoutes);
  await app.register(healthRoutes);
  await app.register(weatherRoutes);
  await app.register(issueDetailRoutes);
  await app.register(ogImageRoutes);
  await app.register(votesRoutes);
  await app.register(sitemapRoutes);
  await app.register(feedRoutes);
  await app.register(issueRoutes);
  await app.register(issueRankingDetailRoutes);
  await app.register(adminConfigRoutes);
  await app.register(adminScraperRoutes);
  await app.register(communityRankingRoutes);
  await app.register(entertainmentUnifiedRoutes);
  await app.register(prerenderRoutes);
  await app.register(debugIssueMergeRoutes);
  await app.register(adminQualityRoutes);

  // 봇 프리렌더: API 이외의 봇 요청에 동적 meta 태그 HTML 반환
  registerPrerender(app, pool);

  // SPA 정적 파일 서빙 (SERVE_FRONTEND=false 시 비활성화 — API 전용 모드)
  const frontendDist = resolve(import.meta.dirname, '../../frontend/dist');
  const isTest = config.nodeEnv === 'test' || process.env.VITEST === 'true';
  if (!isTest && config.serveFrontend && existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      wildcard: false,
      serve: false,  // 자동 서빙 비활성화 — setNotFoundHandler에서 직접 처리
    });
    // SPA fallback: API 이외의 모든 GET → 정적 파일 또는 index.html
    app.setNotFoundHandler(async (req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        // 확장자가 있는 경로(.js, .css 등)는 정적 파일로 시도
        const hasExt = /\.\w+(\?|$)/.test(req.url);
        if (hasExt) {
          return reply.sendFile(req.url.slice(1));
        }
        // SPA 라우트: 항상 index.html 서빙
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not Found' });
    });
    console.log(`[server] serving frontend from ${frontendDist}`);
  }

  // Audit log: structured stdout for mutating requests
  app.addHook('onResponse', (req, reply, done) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const ip = req.ip;
      const ipHash = ip ? Buffer.from(ip).toString('base64').slice(0, 8) : 'unknown';
      const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
      const isAdmin = token !== '' && token === config.adminToken;
      console.log(JSON.stringify({
        audit: true,
        ts: new Date().toISOString(),
        method: req.method,
        path: req.url,
        status: reply.statusCode,
        ipHash,
        admin: isAdmin,
      }));
    }
    done();
  });

  app.addHook('onError', (_req, _reply, error, done) => {
    if (config.sentryDsn) Sentry.captureException(error);
    done();
  });

  return app;
}

const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  // Listen FIRST so healthcheck gets 200 immediately
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });

  // DB validation in background (non-blocking).
  // 2026-04-12 단일 프로세스 모델로 통합: worker 프로세스 그룹 제거.
  //   - fly deploy 후 worker 머신이 stopped 로 방치되는 구조적 결함 제거
  //   - pipelineLock(in-memory) 가 진짜 동일 프로세스 안에서 공유돼 직교 보호 성립
  //   - VM 은 performance-1x 2gb 로 업그레이드(이벤트루프 freeze 방지)
  // RUN_SCHEDULER 환경변수 분기는 더 이상 없음. scheduler + watchdog 모두 항상 기동.
  validateConnection()
    .then(() => {
      startScheduler();
      // Watchdog: 같은 프로세스 안의 in-process 직교 lock 공유 1차 방어선.
      //   pipelineLock 키 일치 → scheduler tick 과 watchdog tick 이 충돌해도 한쪽만 통과.
      startWebWatchdog();
    })
    .catch((err) => {
      console.error('[server] DB validation failed:', err);
      startScheduler();
      startWebWatchdog();
    });

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received — shutting down gracefully`);
    await app.close();
    await awaitRunningScrapers(15_000);
    await gracefulShutdown();
    if (config.sentryDsn) await Sentry.close(2000);
    console.log('[server] shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
