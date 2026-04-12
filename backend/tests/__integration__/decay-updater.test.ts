/**
 * Integration Test: Track B decay-updater (PR #2)
 *
 * pg-mem 에서 post_scores 를 수동 시드 → runTrackBDecay 실행 →
 * trend_score ≈ trend_score_base * exp(-ln2 * age/halfLife) 검증.
 *
 * 커버:
 *  - 1h 전 post, halfLife=60 → trend_score ≈ base * 0.5
 *  - half_life_min NULL 폴백 (COALESCE → 300min)
 *  - 24h 초과 윈도 밖 행은 건드리지 않음
 *  - post_origin NULL / trend_score_base NULL 행 스킵
 *  - decayed_at 갱신됨
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from './setup.js';
import { runTrackBDecay } from '../../src/services/decayUpdater.js';

describe('Track B decay-updater (integration)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = createTestDb();
  });

  afterAll(async () => {
    await db.pool.end();
  });

  beforeEach(async () => {
    await db.pool.query('DELETE FROM post_scores');
    await db.pool.query('DELETE FROM posts');
  });

  async function seedPost(id: number, url: string): Promise<void> {
    await db.pool.query(
      `INSERT INTO posts (id, source_key, source_name, title, url, category)
       VALUES ($1, 'test', 'test', 'title-' || $1, $2, 'community')`,
      [id, url],
    );
  }

  async function seedScore(opts: {
    postId: number;
    base: number;
    ageMinutes: number;
    halfLifeMin: number | null;
  }): Promise<void> {
    const postOrigin = new Date(Date.now() - opts.ageMinutes * 60_000);
    await db.pool.query(
      `INSERT INTO post_scores (post_id, trend_score, trend_score_base, post_origin, half_life_min)
       VALUES ($1, $2, $2, $3, $4)`,
      [opts.postId, opts.base, postOrigin, opts.halfLifeMin],
    );
  }

  it('decays a 1h-old post with halfLife=60 to roughly half of base', async () => {
    await seedPost(1, 'https://x.test/1');
    await seedScore({ postId: 1, base: 10.0, ageMinutes: 60, halfLifeMin: 60 });

    const result = await runTrackBDecay(db.pool);

    expect(result.updated).toBe(1);
    const { rows } = await db.pool.query(
      'SELECT trend_score, decayed_at FROM post_scores WHERE post_id = 1',
    );
    expect(rows[0].trend_score).toBeCloseTo(5.0, 1);
    expect(rows[0].decayed_at).not.toBeNull();
  });

  it('falls back to DEFAULT_HALF_LIFE (300 min) when half_life_min is NULL', async () => {
    await seedPost(2, 'https://x.test/2');
    // 300 min 경과 → exp(-ln2 * 300/300) = 0.5
    await seedScore({ postId: 2, base: 8.0, ageMinutes: 300, halfLifeMin: null });

    await runTrackBDecay(db.pool);

    const { rows } = await db.pool.query(
      'SELECT trend_score FROM post_scores WHERE post_id = 2',
    );
    expect(rows[0].trend_score).toBeCloseTo(4.0, 1);
  });

  it('skips rows outside the 24h window', async () => {
    await seedPost(3, 'https://x.test/3');
    await seedScore({ postId: 3, base: 10.0, ageMinutes: 25 * 60, halfLifeMin: 60 });

    const result = await runTrackBDecay(db.pool);

    expect(result.updated).toBe(0);
    const { rows } = await db.pool.query(
      'SELECT trend_score FROM post_scores WHERE post_id = 3',
    );
    // 손대지 않음 — 시드한 값 그대로
    expect(rows[0].trend_score).toBeCloseTo(10.0, 5);
  });

  it('skips rows where post_origin or trend_score_base is NULL', async () => {
    await seedPost(4, 'https://x.test/4');
    await seedPost(5, 'https://x.test/5');
    // post_origin NULL
    await db.pool.query(
      `INSERT INTO post_scores (post_id, trend_score, trend_score_base, post_origin, half_life_min)
       VALUES (4, 10.0, 10.0, NULL, 60)`,
    );
    // trend_score_base NULL
    await db.pool.query(
      `INSERT INTO post_scores (post_id, trend_score, trend_score_base, post_origin, half_life_min)
       VALUES (5, 10.0, NULL, NOW() - INTERVAL '1 hour', 60)`,
    );

    const result = await runTrackBDecay(db.pool);

    expect(result.updated).toBe(0);
  });
});
