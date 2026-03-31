import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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
import { startScheduler } from './scheduler/index.js';

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
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
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
