import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(): void {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.05,
    ignoreErrors: [
      'ResizeObserver loop',
      'ChunkLoadError',
      /Loading chunk \d+ failed/,
    ],
  });
}

export { Sentry };
