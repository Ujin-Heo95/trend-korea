import * as Sentry from '@sentry/node';
import { config } from './config/index.js';
import { batchPool, validateConnection, gracefulShutdown } from './db/client.js';
import { startScheduler } from './scheduler/index.js';
import { awaitRunningScrapers } from './scrapers/index.js';
import { initScoringConfig } from './services/scoringConfig.js';

// ── Sentry ──────────────────────────────────────────────
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    tracesSampleRate: 0.1,
    environment: config.nodeEnv,
  });
  console.log('[worker] sentry initialized');
}

// ── Process-level error handlers ────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[worker] unhandledRejection:', reason);
  if (config.sentryDsn) Sentry.captureException(reason);
});

process.on('uncaughtException', (err) => {
  console.error('[worker] uncaughtException:', err);
  if (config.sentryDsn) Sentry.captureException(err);
  setTimeout(() => process.exit(1), 3000);
});

// ── Graceful shutdown ───────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`[worker] ${signal} received — shutting down gracefully`);
  await awaitRunningScrapers(15_000);
  await gracefulShutdown();
  if (config.sentryDsn) await Sentry.close(2000);
  console.log('[worker] shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start ───────────────────────────────────────────────
console.log('[worker] started — scheduler only, no HTTP');

validateConnection()
  .then(() => {
    try { initScoringConfig(batchPool); } catch (err) { console.error('[worker] initScoringConfig failed:', err); }
    startScheduler();
  })
  .catch((err) => {
    console.error('[worker] DB validation failed, starting scheduler anyway:', err);
    startScheduler();
  });
