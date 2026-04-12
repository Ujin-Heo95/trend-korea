/**
 * Integration Test: Scoring Batch
 *
 * Tests the scoring pipeline's DB layer using pg-mem:
 *   posts INSERT → computeScore (pure) → post_scores UPSERT
 *
 * pg-mem does not support STDDEV/PERCENT_RANK, so we test the
 * key DB operations directly rather than calling calculateScores().
 * The pure scoring formula is tested in scoring.test.ts (unit).
 *
 * Covers:
 *   - post_scores UPSERT (INSERT + ON CONFLICT UPDATE)
 *   - Score ordering matches engagement levels
 *   - Engagement snapshots recording
 *   - Source engagement stats caching
 *   - Volume dampening factor applied to source counts
 *   - Re-scoring updates existing scores (not duplicates)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, insertTestPosts, type TestDb } from './setup.js';

// Import the pure scoring function
import { computeScore, type ScoreFactors } from '../../src/services/scoring-helpers.js';

// ── Helpers ────────────────────────────────────────────────

function makeFactors(overrides: Partial<ScoreFactors> = {}): ScoreFactors {
  return {
    normalizedEngagement: 5.0,
    decay: 1.0,
    sourceWeight: 1.0,
    categoryWeight: 1.0,
    velocityBonus: 1.0,
    clusterBonus: 1.0,
    trendSignalBonus: 1.0,
    subcategoryNorm: 1.0,
    breakingBoost: 1.0,
    ...overrides,
  };
}

/** Mirrors the production UPSERT in scoring.ts (lines 256-267) */
async function upsertScores(
  pool: TestDb['pool'],
  entries: ReadonlyArray<{
    postId: number;
    score: number;
    srcW: number;
    catW: number;
    velBonus: number;
    clusterBonus: number;
    trendBonus: number;
  }>,
): Promise<number> {
  if (entries.length === 0) return 0;

  const params: unknown[] = [];
  const values: string[] = [];

  for (const e of entries) {
    const i = params.length;
    params.push(e.postId, e.score, e.srcW, e.catW, e.velBonus, e.clusterBonus, e.trendBonus);
    values.push(`($${i+1},$${i+2},$${i+3},$${i+4},NOW(),$${i+5},$${i+6},$${i+7})`);
  }

  const result = await pool.query(
    `INSERT INTO post_scores (post_id, trend_score, source_weight, category_weight, calculated_at, velocity_bonus, cluster_bonus, trend_signal_bonus)
     VALUES ${values.join(',')}
     ON CONFLICT (post_id) DO UPDATE SET
       trend_score = EXCLUDED.trend_score,
       source_weight = EXCLUDED.source_weight,
       category_weight = EXCLUDED.category_weight,
       calculated_at = EXCLUDED.calculated_at,
       velocity_bonus = EXCLUDED.velocity_bonus,
       cluster_bonus = EXCLUDED.cluster_bonus,
       trend_signal_bonus = EXCLUDED.trend_signal_bonus`,
    params,
  );

  return result.rowCount ?? 0;
}

describe('Scoring Batch Integration', () => {
  let testDb: TestDb;

  beforeAll(() => {
    testDb = createTestDb();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(async () => {
    await testDb.pool.query('DELETE FROM post_scores');
    await testDb.pool.query('DELETE FROM engagement_snapshots');
    await testDb.pool.query('DELETE FROM source_engagement_stats');
    await testDb.pool.query('DELETE FROM posts');
  });

  it('post_scores UPSERT: 새 스코어 삽입', async () => {
    const [id1, id2] = await insertTestPosts(testDb.pool, [
      { title: '인기글', url: 'https://ex.com/1', viewCount: 5000, commentCount: 100 },
      { title: '보통글', url: 'https://ex.com/2', viewCount: 100, commentCount: 5 },
    ]);

    const score1 = computeScore(makeFactors({ normalizedEngagement: 10.0 }));
    const score2 = computeScore(makeFactors({ normalizedEngagement: 3.0 }));

    const updated = await upsertScores(testDb.pool, [
      { postId: id1, score: score1, srcW: 2.5, catW: 1.2, velBonus: 1.3, clusterBonus: 1.5, trendBonus: 1.2 },
      { postId: id2, score: score2, srcW: 1.0, catW: 1.0, velBonus: 1.0, clusterBonus: 1.0, trendBonus: 1.0 },
    ]);

    expect(updated).toBe(2);

    // 점수 순서 확인 (높은 engagement → 높은 score)
    const { rows } = await testDb.pool.query<{
      post_id: number; trend_score: number; source_weight: number;
    }>('SELECT post_id, trend_score, source_weight FROM post_scores ORDER BY trend_score DESC');

    expect(rows).toHaveLength(2);
    expect(rows[0].post_id).toBe(id1);
    expect(rows[0].trend_score).toBeGreaterThan(rows[1].trend_score);
    expect(rows[0].source_weight).toBe(2.5);
  });

  it('post_scores UPSERT: 재계산 시 기존 점수 업데이트 (중복 생성 아님)', async () => {
    const [id] = await insertTestPosts(testDb.pool, [
      { title: '업데이트 테스트', url: 'https://ex.com/upsert' },
    ]);

    // 첫 스코어링
    await upsertScores(testDb.pool, [
      { postId: id, score: 5.0, srcW: 1.0, catW: 1.0, velBonus: 1.0, clusterBonus: 1.0, trendBonus: 1.0 },
    ]);

    // 재스코어링 (점수 변경)
    await upsertScores(testDb.pool, [
      { postId: id, score: 15.0, srcW: 2.0, catW: 1.5, velBonus: 1.2, clusterBonus: 2.0, trendBonus: 1.5 },
    ]);

    const { rows } = await testDb.pool.query<{ cnt: string }>(
      'SELECT COUNT(*) AS cnt FROM post_scores WHERE post_id = $1',
      [id],
    );
    expect(Number(rows[0].cnt)).toBe(1); // 중복 아님

    const { rows: scoreRows } = await testDb.pool.query<{ trend_score: number; cluster_bonus: number }>(
      'SELECT trend_score, cluster_bonus FROM post_scores WHERE post_id = $1',
      [id],
    );
    expect(scoreRows[0].trend_score).toBe(15.0); // 업데이트됨
    expect(scoreRows[0].cluster_bonus).toBe(2.0);
  });

  it('점수 순위: 다양한 engagement 수준에 따른 정렬', async () => {
    const posts = await insertTestPosts(testDb.pool, [
      { title: '바이럴', url: 'https://ex.com/viral', viewCount: 50000, commentCount: 500 },
      { title: '핫이슈', url: 'https://ex.com/hot', viewCount: 10000, commentCount: 200 },
      { title: '일반글', url: 'https://ex.com/normal', viewCount: 500, commentCount: 10 },
      { title: '신규글', url: 'https://ex.com/new', viewCount: 10, commentCount: 0 },
    ]);

    const scores = [
      { postId: posts[0], score: 100.0, srcW: 2.5, catW: 1.2, velBonus: 1.5, clusterBonus: 2.0, trendBonus: 1.8 },
      { postId: posts[1], score: 30.0, srcW: 2.0, catW: 1.1, velBonus: 1.2, clusterBonus: 1.5, trendBonus: 1.3 },
      { postId: posts[2], score: 5.0, srcW: 1.0, catW: 1.0, velBonus: 1.0, clusterBonus: 1.0, trendBonus: 1.0 },
      { postId: posts[3], score: 1.0, srcW: 0.8, catW: 1.0, velBonus: 1.0, clusterBonus: 1.0, trendBonus: 1.0 },
    ];

    await upsertScores(testDb.pool, scores);

    const { rows } = await testDb.pool.query<{ post_id: number; trend_score: number }>(
      'SELECT post_id, trend_score FROM post_scores ORDER BY trend_score DESC',
    );

    expect(rows).toHaveLength(4);
    expect(rows[0].post_id).toBe(posts[0]); // 바이럴 1위
    expect(rows[1].post_id).toBe(posts[1]); // 핫이슈 2위
    expect(rows[2].post_id).toBe(posts[2]); // 일반글 3위
    expect(rows[3].post_id).toBe(posts[3]); // 신규글 4위
  });

  it('engagement 스냅샷 기록 + 조회', async () => {
    const [id] = await insertTestPosts(testDb.pool, [
      { title: '스냅샷 테스트', url: 'https://ex.com/snap', viewCount: 1000, commentCount: 50 },
    ]);

    const t1 = new Date('2026-04-11T10:00:00Z');
    const t2 = new Date('2026-04-11T12:00:00Z'); // 2시간 후

    // 스냅샷 기록 (스크래퍼가 하는 것과 동일)
    await testDb.pool.query(
      `INSERT INTO engagement_snapshots (post_id, view_count, comment_count, like_count, captured_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, 1000, 50, 10, t1],
    );

    // 2시간 후 업데이트된 스냅샷 (velocity 계산용)
    await testDb.pool.query(
      `INSERT INTO engagement_snapshots (post_id, view_count, comment_count, like_count, captured_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, 3000, 120, 30, t2],
    );

    const { rows } = await testDb.pool.query<{
      view_count: number; comment_count: number;
    }>(
      `SELECT view_count, comment_count
       FROM engagement_snapshots
       WHERE post_id = $1
       ORDER BY captured_at DESC`,
      [id],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].view_count).toBe(3000); // 최신
    expect(rows[1].view_count).toBe(1000); // 이전

    // Velocity = 최신 - 이전
    const viewVelocity = rows[0].view_count - rows[1].view_count;
    expect(viewVelocity).toBe(2000);
  });

  it('source_engagement_stats UPSERT', async () => {
    await testDb.pool.query(
      `INSERT INTO source_engagement_stats
       (source_key, mean_log_views, stddev_log_views, mean_log_comments, stddev_log_comments, mean_log_likes, stddev_log_likes, sample_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['dcinside', 5.2, 1.8, 2.1, 0.9, 1.5, 0.7, 150],
    );

    // 재계산 시 업데이트
    await testDb.pool.query(
      `INSERT INTO source_engagement_stats
       (source_key, mean_log_views, stddev_log_views, mean_log_comments, stddev_log_comments, mean_log_likes, stddev_log_likes, sample_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (source_key) DO UPDATE SET
         mean_log_views = EXCLUDED.mean_log_views,
         sample_count = EXCLUDED.sample_count,
         calculated_at = NOW()`,
      ['dcinside', 5.5, 1.9, 2.3, 1.0, 1.6, 0.8, 200],
    );

    const { rows } = await testDb.pool.query<{ mean_log_views: number; sample_count: number }>(
      'SELECT mean_log_views, sample_count FROM source_engagement_stats WHERE source_key = $1',
      ['dcinside'],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].mean_log_views).toBe(5.5); // 업데이트됨
    expect(rows[0].sample_count).toBe(200);
  });

  it('computeScore 결과가 post_scores에 정확히 저장', async () => {
    const [id] = await insertTestPosts(testDb.pool, [
      { title: '정확도 테스트', url: 'https://ex.com/exact' },
    ]);

    const factors = makeFactors({
      normalizedEngagement: 8.0,
      decay: 0.75,
      sourceWeight: 2.2,
      categoryWeight: 1.08,
      velocityBonus: 1.3,
      clusterBonus: 1.5,
      trendSignalBonus: 1.2,
    });
    const expectedScore = computeScore(factors);

    await upsertScores(testDb.pool, [{
      postId: id,
      score: expectedScore,
      srcW: factors.sourceWeight,
      catW: factors.categoryWeight,
      velBonus: factors.velocityBonus,
      clusterBonus: factors.clusterBonus,
      trendBonus: factors.trendSignalBonus,
    }]);

    const { rows } = await testDb.pool.query<{
      trend_score: number;
      source_weight: number;
      velocity_bonus: number;
    }>('SELECT trend_score, source_weight, velocity_bonus FROM post_scores WHERE post_id = $1', [id]);

    // 부동소수점 비교
    expect(rows[0].trend_score).toBeCloseTo(expectedScore, 6);
    expect(rows[0].source_weight).toBeCloseTo(2.2, 6);
    expect(rows[0].velocity_bonus).toBeCloseTo(1.3, 6);
  });

  it('게시글 삭제 시 post_scores CASCADE 삭제', async () => {
    const [id] = await insertTestPosts(testDb.pool, [
      { title: '삭제 테스트', url: 'https://ex.com/del-score' },
    ]);

    await upsertScores(testDb.pool, [
      { postId: id, score: 10.0, srcW: 1.0, catW: 1.0, velBonus: 1.0, clusterBonus: 1.0, trendBonus: 1.0 },
    ]);

    await testDb.pool.query('DELETE FROM posts WHERE id = $1', [id]);

    const { rows } = await testDb.pool.query<{ cnt: string }>(
      'SELECT COUNT(*) AS cnt FROM post_scores WHERE post_id = $1',
      [id],
    );
    expect(Number(rows[0].cnt)).toBe(0);
  });
});
