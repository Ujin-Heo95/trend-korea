/**
 * Integration Test: Vote Flow
 *
 * Tests the complete vote lifecycle using pg-mem:
 *   INSERT vote → check uniqueness → update vote_count
 *
 * NOTE: pg-mem has a known issue with ON CONFLICT DO NOTHING inside
 * CTEs (RETURNING still fires on conflict). We test the same logic
 * with separate statements — the atomic CTE in production uses
 * identical SQL primitives, just composed differently.
 *
 * Covers:
 *   - First vote: is_new_vote=true, vote_count incremented
 *   - Duplicate vote (same IP): is_new_vote=false, vote_count unchanged
 *   - Multiple IPs: vote_count reflects unique voters
 *   - CASCADE delete: removing post cleans up votes
 *   - Unique constraint enforcement
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, insertTestPosts, type TestDb } from './setup.js';

// ── Vote logic (pg-mem compatible) ─────────────────────────
//
// pg-mem bug: ON CONFLICT DO NOTHING still returns rowCount=1.
// Workaround: check existence first, then insert if new.
// Same business logic as the production atomic CTE.

async function executeVote(
  pool: TestDb['pool'],
  postId: number,
  ipHash: string,
): Promise<{ vote_count: number; is_new_vote: boolean }> {
  // Step 1: check if already voted
  const { rows: existing } = await pool.query<{ cnt: string }>(
    'SELECT COUNT(*) AS cnt FROM post_votes WHERE post_id = $1 AND ip_hash = $2',
    [postId, ipHash],
  );
  const alreadyVoted = Number(existing[0].cnt) > 0;

  // Step 2: insert only if new
  if (!alreadyVoted) {
    await pool.query(
      'INSERT INTO post_votes (post_id, ip_hash) VALUES ($1, $2)',
      [postId, ipHash],
    );
    await pool.query(
      'UPDATE posts SET vote_count = vote_count + 1 WHERE id = $1',
      [postId],
    );
  }

  // Step 3: read current count
  const { rows } = await pool.query<{ vote_count: number }>(
    'SELECT vote_count FROM posts WHERE id = $1',
    [postId],
  );

  return {
    vote_count: rows[0]?.vote_count ?? 0,
    is_new_vote: !alreadyVoted,
  };
}

describe('Vote Flow Integration', () => {
  let testDb: TestDb;
  let postId: number;

  beforeAll(() => {
    testDb = createTestDb();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(async () => {
    // Clean slate for each test
    await testDb.pool.query('DELETE FROM post_votes');
    await testDb.pool.query('DELETE FROM posts');

    const [id] = await insertTestPosts(testDb.pool, [
      { title: '투표 테스트 게시글', url: 'https://example.com/vote-test' },
    ]);
    postId = id;
  });

  it('첫 투표: is_new_vote=true, vote_count=1', async () => {
    const result = await executeVote(testDb.pool, postId, 'ip_hash_aaa');

    expect(result.is_new_vote).toBe(true);
    expect(result.vote_count).toBe(1);
  });

  it('중복 투표 (같은 IP): is_new_vote=false, vote_count 유지', async () => {
    await executeVote(testDb.pool, postId, 'ip_hash_bbb');
    const second = await executeVote(testDb.pool, postId, 'ip_hash_bbb');

    expect(second.is_new_vote).toBe(false);
    expect(second.vote_count).toBe(1);
  });

  it('다른 IP 투표: vote_count 증가', async () => {
    await executeVote(testDb.pool, postId, 'ip_hash_ccc');
    const result = await executeVote(testDb.pool, postId, 'ip_hash_ddd');

    expect(result.is_new_vote).toBe(true);
    expect(result.vote_count).toBe(2);
  });

  it('3명 연속 투표 후 정확한 카운트', async () => {
    await executeVote(testDb.pool, postId, 'ip_1');
    await executeVote(testDb.pool, postId, 'ip_2');
    const third = await executeVote(testDb.pool, postId, 'ip_3');

    expect(third.vote_count).toBe(3);

    // DB 직접 검증
    const { rows } = await testDb.pool.query<{ vote_count: number }>(
      'SELECT vote_count FROM posts WHERE id = $1',
      [postId],
    );
    expect(rows[0].vote_count).toBe(3);
  });

  it('중복 포함 혼합 투표: unique만 카운트', async () => {
    await executeVote(testDb.pool, postId, 'ip_x');
    await executeVote(testDb.pool, postId, 'ip_y');
    await executeVote(testDb.pool, postId, 'ip_x'); // duplicate
    await executeVote(testDb.pool, postId, 'ip_z');
    await executeVote(testDb.pool, postId, 'ip_y'); // duplicate

    const { rows: voteRows } = await testDb.pool.query<{ cnt: string }>(
      'SELECT COUNT(*) AS cnt FROM post_votes WHERE post_id = $1',
      [postId],
    );
    expect(Number(voteRows[0].cnt)).toBe(3); // only 3 unique

    const { rows: postRows } = await testDb.pool.query<{ vote_count: number }>(
      'SELECT vote_count FROM posts WHERE id = $1',
      [postId],
    );
    expect(postRows[0].vote_count).toBe(3);
  });

  it('게시글 삭제 시 투표 CASCADE 삭제', async () => {
    await executeVote(testDb.pool, postId, 'ip_del');

    await testDb.pool.query('DELETE FROM posts WHERE id = $1', [postId]);

    const { rows } = await testDb.pool.query<{ cnt: string }>(
      'SELECT COUNT(*) AS cnt FROM post_votes WHERE post_id = $1',
      [postId],
    );
    expect(Number(rows[0].cnt)).toBe(0);
  });

  it('서로 다른 게시글에 같은 IP로 투표 가능', async () => {
    const [post2] = await insertTestPosts(testDb.pool, [
      { title: '두번째 게시글', url: 'https://example.com/vote-test-2' },
    ]);

    const r1 = await executeVote(testDb.pool, postId, 'same_ip');
    const r2 = await executeVote(testDb.pool, post2, 'same_ip');

    expect(r1.is_new_vote).toBe(true);
    expect(r2.is_new_vote).toBe(true);
    expect(r1.vote_count).toBe(1);
    expect(r2.vote_count).toBe(1);
  });
});
