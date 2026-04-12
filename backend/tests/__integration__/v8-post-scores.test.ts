/**
 * Integration test: persistPostScoresFromV8
 *
 * Verifies that v8 unifiedScore(normalizedScore) is upserted into
 * post_scores.trend_score so that /api/posts?sort=trending and the
 * 종합 탭 issue cards share the same ordering source.
 *
 * Covers:
 *  - Initial INSERT (one row per post_id)
 *  - ON CONFLICT UPDATE (re-tick overwrites, no duplicate rows)
 *  - Ordering by trend_score DESC matches input normalizedScore order
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, insertTestPosts, type TestDb } from './setup.js';
import { persistPostScoresFromV8 } from '../../src/services/v8/pipeline.js';
import type { V8PostScore } from '../../src/services/v8/types.js';

function makeScore(postId: number, normalizedScore: number): V8PostScore {
  return {
    postId,
    channel: 'news',
    rawScore: normalizedScore,
    normalizedScore,
    signals: {
      sourceWeight: 1,
      categoryWeight: 1,
      engagementZ: 0,
      freshness: 1,
      crossChannelEcho: 1,
    },
    calculatedAt: new Date(),
  };
}

describe('persistPostScoresFromV8 (integration)', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(async () => {
    await testDb.teardown();
  });

  it('inserts trend_score for every scored post', async () => {
    const ids = await insertTestPosts(testDb.pool, [
      { title: 'A', url: 'http://x/a' },
      { title: 'B', url: 'http://x/b' },
      { title: 'C', url: 'http://x/c' },
    ]);

    const scores = [
      makeScore(ids[0], 0.5),
      makeScore(ids[1], 1.5),
      makeScore(ids[2], 0.9),
    ];

    const upserted = await persistPostScoresFromV8(testDb.pool, scores, new Date());
    expect(upserted).toBe(3);

    const { rows } = await testDb.pool.query<{ post_id: number; trend_score: number }>(
      `SELECT post_id, trend_score FROM post_scores ORDER BY trend_score DESC`,
    );
    expect(rows.map(r => r.post_id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('ON CONFLICT updates existing rows without duplicating', async () => {
    const ids = await insertTestPosts(testDb.pool, [
      { title: 'A', url: 'http://x/a' },
      { title: 'B', url: 'http://x/b' },
    ]);

    await persistPostScoresFromV8(
      testDb.pool,
      [makeScore(ids[0], 0.1), makeScore(ids[1], 0.2)],
      new Date(),
    );

    // Second tick — overwrite with new scores
    await persistPostScoresFromV8(
      testDb.pool,
      [makeScore(ids[0], 9.9), makeScore(ids[1], 0.05)],
      new Date(),
    );

    const { rows: count } = await testDb.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM post_scores`,
    );
    expect(parseInt(count[0].c, 10)).toBe(2);

    const { rows } = await testDb.pool.query<{ post_id: number; trend_score: number }>(
      `SELECT post_id, trend_score FROM post_scores ORDER BY trend_score DESC`,
    );
    expect(rows.map(r => r.post_id)).toEqual([ids[0], ids[1]]);
    expect(rows[0].trend_score).toBeCloseTo(9.9);
    expect(rows[1].trend_score).toBeCloseTo(0.05);
  });

  it('returns 0 and is a no-op for empty scores', async () => {
    const upserted = await persistPostScoresFromV8(testDb.pool, [], new Date());
    expect(upserted).toBe(0);
    const { rows } = await testDb.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM post_scores`,
    );
    expect(parseInt(rows[0].c, 10)).toBe(0);
  });
});
