import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Mock the DB client
vi.mock('../../src/db/client.js', () => ({
  pool: {
    query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
      // GET /api/daily-report/latest
      if (sql.includes('ORDER BY report_date DESC')) {
        return {
          rows: [{
            id: 1,
            report_date: '2026-03-29',
            generated_at: '2026-03-29T07:00:00Z',
            status: 'published',
            view_count: 42,
          }],
        };
      }
      // GET /api/daily-report/:date — report query
      if (sql.includes('WHERE report_date = $1 AND status')) {
        const date = params?.[0];
        if (date === '2026-03-29') {
          return {
            rows: [{
              id: 1,
              report_date: '2026-03-29',
              generated_at: '2026-03-29T07:00:00Z',
              status: 'published',
              view_count: 42,
            }],
          };
        }
        return { rows: [] };
      }
      // Sections query
      if (sql.includes('daily_report_sections')) {
        return {
          rows: [
            {
              category: 'news', rank: 1, summary: 'test summary',
              category_summary: 'news overview', post_id: 1,
              title: 'Test Title', url: 'https://example.com',
              source_name: 'Test', view_count: 100, comment_count: 10,
              cluster_size: 1,
            },
          ],
        };
      }
      // view_count update
      if (sql.includes('view_count = view_count + 1')) {
        return { rowCount: 1 };
      }
      return { rows: [] };
    }),
    end: vi.fn(),
  },
}));

// Mock scheduler to prevent cron startup
vi.mock('../../src/scheduler/index.js', () => ({
  startScheduler: vi.fn(),
}));

import { buildApp } from '../../src/server.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/daily-report/latest', () => {
  it('returns latest published report', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/daily-report/latest' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.report_date).toBe('2026-03-29');
    expect(body.status).toBe('published');
  });
});

describe('GET /api/daily-report/:date', () => {
  it('returns report with sections', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/daily-report/2026-03-29' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.report_date).toBe('2026-03-29');
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0].category).toBe('news');
  });

  it('returns 404 for nonexistent date', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/daily-report/2020-01-01' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid date format', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/daily-report/invalid' });
    expect(res.statusCode).toBe(400);
  });
});
