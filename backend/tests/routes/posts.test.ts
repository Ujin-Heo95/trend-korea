import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/server.js';

describe('GET /api/posts', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
    await app.pg.query(
      `INSERT INTO posts (source_key,source_name,title,url)
       VALUES ('test','테스트','테스트글','https://test.example.com/1')
       ON CONFLICT DO NOTHING`
    );
  });

  afterAll(async () => {
    await app.pg.query(`DELETE FROM posts WHERE source_key='test'`);
    await app.close();
  });

  it('returns posts array with total', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts?limit=5' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.posts)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  it('filters by source_key', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts?source=test&limit=5' });
    const body = JSON.parse(res.body);
    expect(body.posts.every((p: any) => p.source_key === 'test')).toBe(true);
  });

  it('GET /api/sources returns source list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sources' });
    expect(res.statusCode).toBe(200);
    const sources = JSON.parse(res.body);
    expect(Array.isArray(sources)).toBe(true);
    expect(sources.length).toBe(60);
  });
});
