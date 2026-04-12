/**
 * Integration Test: Dedup + Trending
 *
 * Tests the deduplication clustering DB layer using pg-mem:
 *   - L1: title_hash 기반 정확 매칭
 *   - L2: bigram Jaccard / word Jaccard 유사도 매칭
 *   - L3: thumbnail URL 매칭
 *   - Cluster lifecycle: 생성, 멤버 추가, canonical 선정, CASCADE 삭제
 *
 * NOTE: pg-mem does not support ROLLBACK in transactions properly,
 * so cluster writes use sequential queries instead of BEGIN/COMMIT.
 * The dedup pure functions (normalizeTitle, bigrams, etc.) are
 * tested in services/dedup.test.ts (unit tests).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, insertTestPosts, type TestDb } from './setup.js';
import {
  normalizeTitle,
  titleHash,
  bigrams,
  jaccardSimilarity,
  koreanTokenize,
  wordJaccardSimilarity,
} from '../../src/services/dedup.js';

// ── Cluster DB helpers (mirrors dedup.ts cluster writes) ───

async function createCluster(
  pool: TestDb['pool'],
  canonicalPostId: number,
  members: ReadonlyArray<{ postId: number; score: number; layer: 'L1' | 'L2' | 'L3' }>,
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO post_clusters (canonical_post_id, member_count)
     VALUES ($1, $2) RETURNING id`,
    [canonicalPostId, members.length],
  );
  const clusterId = rows[0].id;

  for (const m of members) {
    await pool.query(
      `INSERT INTO post_cluster_members (cluster_id, post_id, similarity_score, match_layer)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cluster_id, post_id) DO NOTHING`,
      [clusterId, m.postId, m.score, m.layer],
    );
  }

  return clusterId;
}

async function joinCluster(
  pool: TestDb['pool'],
  clusterId: number,
  postId: number,
  score: number,
  layer: 'L1' | 'L2' | 'L3',
): Promise<void> {
  await pool.query(
    `INSERT INTO post_cluster_members (cluster_id, post_id, similarity_score, match_layer)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cluster_id, post_id) DO NOTHING`,
    [clusterId, postId, score, layer],
  );

  // Update member_count
  const { rows } = await pool.query<{ cnt: string }>(
    'SELECT COUNT(*) AS cnt FROM post_cluster_members WHERE cluster_id = $1',
    [clusterId],
  );
  await pool.query(
    'UPDATE post_clusters SET member_count = $2 WHERE id = $1',
    [clusterId, Number(rows[0].cnt)],
  );
}

describe('Dedup + Trending Integration', () => {
  let testDb: TestDb;

  beforeAll(() => {
    testDb = createTestDb();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(async () => {
    await testDb.pool.query('DELETE FROM post_cluster_members');
    await testDb.pool.query('DELETE FROM post_clusters');
    await testDb.pool.query('DELETE FROM posts');
  });

  // ── L1: Title Hash ──────────────────────────────────────

  describe('L1: title_hash 매칭', () => {
    it('동일 제목의 게시글은 같은 title_hash 생성', () => {
      const h1 = titleHash('윤석열 대통령 탄핵안 가결');
      const h2 = titleHash('[속보] 윤석열 대통령 탄핵안 가결!!!');
      // 정규화 후 동일 (괄호/특수문자 제거)
      expect(h1).toBe(h2);
    });

    it('L1 매칭 게시글로 클러스터 생성', async () => {
      const title = '한국은행 기준금리 동결 결정';
      const hash = titleHash(title);

      const [id1, id2] = await insertTestPosts(testDb.pool, [
        { title, url: 'https://yna.co.kr/1', viewCount: 5000, category: 'news' },
        { title: '[속보] ' + title, url: 'https://sbs.co.kr/1', viewCount: 3000, category: 'news' },
      ]);

      // title_hash 설정 (pg-mem에서는 GENERATED 안 되므로 수동)
      await testDb.pool.query('UPDATE posts SET title_hash = $1 WHERE id = $2', [hash, id1]);
      await testDb.pool.query('UPDATE posts SET title_hash = $1 WHERE id = $2', [titleHash('[속보] ' + title), id2]);

      // 동일 해시 확인
      expect(titleHash(title)).toBe(titleHash('[속보] ' + title));

      // 클러스터 생성 (canonical = 조회수 높은 게시글)
      const clusterId = await createCluster(testDb.pool, id1, [
        { postId: id1, score: 1.0, layer: 'L1' },
        { postId: id2, score: 1.0, layer: 'L1' },
      ]);

      const { rows } = await testDb.pool.query<{
        canonical_post_id: number;
        member_count: number;
      }>('SELECT canonical_post_id, member_count FROM post_clusters WHERE id = $1', [clusterId]);

      expect(rows[0].canonical_post_id).toBe(id1); // 조회수 높은 게시글이 canonical
      expect(rows[0].member_count).toBe(2);
    });
  });

  // ── L2: Bigram + Word Jaccard ───────────────────────────

  describe('L2: 유사도 매칭', () => {
    it('바이그램 Jaccard >= 0.8이면 L2 매칭', () => {
      const sim = jaccardSimilarity(
        bigrams('삼성전자 반도체 실적 호황 전망 발표'),
        bigrams('삼성전자 반도체 실적 호황 전망 공개'),
      );
      expect(sim).toBeGreaterThanOrEqual(0.8);
    });

    it('단어 Jaccard >= 0.65면 L2 매칭 (어순 무관)', () => {
      const sim = wordJaccardSimilarity(
        koreanTokenize('삼성전자 반도체 실적 호황 전망'),
        koreanTokenize('반도체 호황 삼성전자 실적 전망'),
      );
      expect(sim).toBeGreaterThanOrEqual(0.65);
    });

    it('전혀 다른 기사는 매칭 안 됨', () => {
      const bigramSim = jaccardSimilarity(
        bigrams('삼성전자 반도체 실적'),
        bigrams('부산 해수욕장 개장'),
      );
      expect(bigramSim).toBeLessThan(0.8);

      const wordSim = wordJaccardSimilarity(
        koreanTokenize('삼성전자 반도체 실적'),
        koreanTokenize('부산 해수욕장 개장'),
      );
      expect(wordSim).toBeLessThan(0.65);
    });

    it('L2 유사 게시글 클러스터링 + DB 저장', async () => {
      const [id1, id2] = await insertTestPosts(testDb.pool, [
        { title: '삼성전자 반도체 실적 호황 전망 발표', url: 'https://a.com/1', category: 'news' },
        { title: '삼성전자 반도체 실적 호황 전망 공개', url: 'https://b.com/1', category: 'news' },
      ]);

      const sim = jaccardSimilarity(
        bigrams('삼성전자 반도체 실적 호황 전망 발표'),
        bigrams('삼성전자 반도체 실적 호황 전망 공개'),
      );

      const clusterId = await createCluster(testDb.pool, id1, [
        { postId: id1, score: 1.0, layer: 'L1' },
        { postId: id2, score: sim, layer: 'L2' },
      ]);

      const { rows } = await testDb.pool.query<{
        post_id: number; similarity_score: number; match_layer: string;
      }>(
        'SELECT post_id, similarity_score, match_layer FROM post_cluster_members WHERE cluster_id = $1 ORDER BY post_id',
        [clusterId],
      );

      expect(rows).toHaveLength(2);
      const l2Member = rows.find(r => r.match_layer === 'L2');
      expect(l2Member).toBeDefined();
      expect(l2Member!.similarity_score).toBeGreaterThanOrEqual(0.8);
    });
  });

  // ── L3: Thumbnail ───────────────────────────────────────

  describe('L3: 썸네일 매칭', () => {
    it('동일 썸네일 URL로 클러스터 생성', async () => {
      const thumb = 'https://cdn.example.com/shared-image.jpg';

      const [id1, id2] = await insertTestPosts(testDb.pool, [
        { title: '뉴스A 제목', url: 'https://a.com/2', thumbnail: thumb, category: 'news' },
        { title: '뉴스B 다른제목', url: 'https://b.com/2', thumbnail: thumb, category: 'news' },
      ]);

      const clusterId = await createCluster(testDb.pool, id1, [
        { postId: id1, score: 1.0, layer: 'L3' },
        { postId: id2, score: 1.0, layer: 'L3' },
      ]);

      const { rows } = await testDb.pool.query<{ match_layer: string }>(
        'SELECT match_layer FROM post_cluster_members WHERE cluster_id = $1',
        [clusterId],
      );

      expect(rows.every(r => r.match_layer === 'L3')).toBe(true);
    });
  });

  // ── Cluster Lifecycle ───────────────────────────────────

  describe('클러스터 생명주기', () => {
    it('기존 클러스터에 새 멤버 추가 + member_count 업데이트', async () => {
      const [id1, id2, id3] = await insertTestPosts(testDb.pool, [
        { title: '원본 기사', url: 'https://ex.com/c1', viewCount: 5000, category: 'news' },
        { title: '복사 기사', url: 'https://ex.com/c2', viewCount: 2000, category: 'news' },
        { title: '추가 기사', url: 'https://ex.com/c3', viewCount: 1000, category: 'news' },
      ]);

      // 2개로 시작
      const clusterId = await createCluster(testDb.pool, id1, [
        { postId: id1, score: 1.0, layer: 'L1' },
        { postId: id2, score: 0.9, layer: 'L2' },
      ]);

      // 3번째 멤버 추가
      await joinCluster(testDb.pool, clusterId, id3, 0.85, 'L2');

      const { rows } = await testDb.pool.query<{ member_count: number }>(
        'SELECT member_count FROM post_clusters WHERE id = $1',
        [clusterId],
      );
      expect(rows[0].member_count).toBe(3);
    });

    it('중복 멤버 추가 시 ON CONFLICT DO NOTHING', async () => {
      const [id1, id2] = await insertTestPosts(testDb.pool, [
        { title: '테스트1', url: 'https://ex.com/dup1', category: 'news' },
        { title: '테스트2', url: 'https://ex.com/dup2', category: 'news' },
      ]);

      const clusterId = await createCluster(testDb.pool, id1, [
        { postId: id1, score: 1.0, layer: 'L1' },
        { postId: id2, score: 0.9, layer: 'L2' },
      ]);

      // 같은 멤버 다시 추가 시도
      await joinCluster(testDb.pool, clusterId, id2, 0.95, 'L1');

      const { rows } = await testDb.pool.query<{ cnt: string }>(
        'SELECT COUNT(*) AS cnt FROM post_cluster_members WHERE cluster_id = $1',
        [clusterId],
      );
      expect(Number(rows[0].cnt)).toBe(2); // 중복 안 됨
    });

    it('게시글 삭제 시 클러스터 멤버 CASCADE 삭제', async () => {
      const [id1, id2] = await insertTestPosts(testDb.pool, [
        { title: 'cas1', url: 'https://ex.com/cas1', category: 'news' },
        { title: 'cas2', url: 'https://ex.com/cas2', category: 'news' },
      ]);

      const clusterId = await createCluster(testDb.pool, id1, [
        { postId: id1, score: 1.0, layer: 'L1' },
        { postId: id2, score: 0.9, layer: 'L2' },
      ]);

      // 멤버 게시글 삭제
      await testDb.pool.query('DELETE FROM posts WHERE id = $1', [id2]);

      const { rows } = await testDb.pool.query<{ cnt: string }>(
        'SELECT COUNT(*) AS cnt FROM post_cluster_members WHERE cluster_id = $1 AND post_id = $2',
        [clusterId, id2],
      );
      expect(Number(rows[0].cnt)).toBe(0);
    });

    it('트렌딩 조회: 클러스터 canonical 기준 정렬', async () => {
      const [id1, id2, id3] = await insertTestPosts(testDb.pool, [
        { title: '핫이슈', url: 'https://ex.com/t1', viewCount: 10000, category: 'news' },
        { title: '핫이슈 복사', url: 'https://ex.com/t2', viewCount: 3000, category: 'news' },
        { title: '다른뉴스', url: 'https://ex.com/t3', viewCount: 5000, category: 'news' },
      ]);

      // id1+id2 클러스터 (canonical = id1)
      await createCluster(testDb.pool, id1, [
        { postId: id1, score: 1.0, layer: 'L1' },
        { postId: id2, score: 0.9, layer: 'L2' },
      ]);

      // 트렌딩 쿼리: canonical 게시글만 보여주기 (중복 제거)
      // pg-mem은 상관 서브쿼리에서 outer alias를 지원하지 않으므로
      // LEFT JOIN + IS NULL 패턴으로 동일 로직 구현
      const { rows } = await testDb.pool.query<{ id: number; title: string }>(
        `SELECT posts.id, posts.title
         FROM posts
         LEFT JOIN post_cluster_members pcm ON pcm.post_id = posts.id
         LEFT JOIN post_clusters pc ON pc.id = pcm.cluster_id AND pc.canonical_post_id != posts.id
         WHERE posts.category = 'news'
           AND pc.id IS NULL
         ORDER BY posts.view_count DESC`,
      );

      // id2는 클러스터 멤버이지만 canonical이 아니므로 제외
      const ids = rows.map(r => r.id);
      expect(ids).toContain(id1); // canonical
      expect(ids).toContain(id3); // 독립 게시글
      expect(ids).not.toContain(id2); // 중복 제거됨
    });
  });
});
