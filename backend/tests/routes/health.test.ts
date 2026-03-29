import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../../src/server.js';

describe('GET /health', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with status ok or degraded when DB is available', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(['ok', 'degraded']).toContain(body.status);
  });

  it('response includes all required db fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(typeof body.db.connected).toBe('boolean');
    expect(typeof body.db.post_count).toBe('number');
    expect(typeof body.db.db_size_mb).toBe('number');
    expect(typeof body.db.oldest_post_age_days).toBe('number');
  });

  it('response includes scrapers object with sources array', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(typeof body.scrapers.total).toBe('number');
    expect(Array.isArray(body.scrapers.sources)).toBe(true);
    expect(typeof body.scrapers.failed_last_run).toBe('number');
  });

  it('returns 503 when DB is unreachable', async () => {
    const original = app.pg.query.bind(app.pg);
    (app.pg as any).query = vi.fn().mockRejectedValue(new Error('connection refused'));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.db.connected).toBe(false);
    (app.pg as any).query = original;
  });
});
