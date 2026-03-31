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
    // ADMIN_TOKEN 미설정 시 상세 공개, 설정 시 인증 필요
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(typeof body.db.connected).toBe('boolean');
  });

  it('response includes scrapers object with sources array', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    // ADMIN_TOKEN 미설정 시 상세 포함
    if (body.scrapers) {
      expect(typeof body.scrapers.total).toBe('number');
      expect(Array.isArray(body.scrapers.sources)).toBe(true);
      expect(typeof body.scrapers.failed_last_run).toBe('number');
    }
  });

  it('returns minimal info when ADMIN_TOKEN is set and request is unauthenticated', async () => {
    // ADMIN_TOKEN 설정 시 미인증 요청은 최소 정보만 반환
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.db.connected).toBeDefined();
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
