/**
 * Integration test helper: pg-mem in-memory PostgreSQL.
 *
 * Creates a minimal schema matching production tables needed for
 * vote, scoring, and dedup integration tests.
 *
 * NOTE: pg-mem does not support GENERATED ALWAYS AS columns, so
 * title_hash is a regular nullable column here. Tests that need
 * it must INSERT the value explicitly.
 */
import { newDb, type IMemoryDb } from 'pg-mem';
import type { Pool } from 'pg';

// ── Schema DDL (production-compatible subset) ──────────────

const SCHEMA_SQL = `
  CREATE TABLE posts (
    id            BIGSERIAL PRIMARY KEY,
    source_key    VARCHAR(32)  NOT NULL,
    source_name   VARCHAR(64)  NOT NULL,
    title         TEXT         NOT NULL,
    url           TEXT         NOT NULL UNIQUE,
    thumbnail     TEXT,
    author        VARCHAR(128),
    view_count    INTEGER      DEFAULT 0,
    comment_count INTEGER      DEFAULT 0,
    like_count    INTEGER      DEFAULT 0,
    vote_count    INTEGER      DEFAULT 0,
    published_at  TIMESTAMPTZ,
    first_scraped_at TIMESTAMPTZ DEFAULT NOW(),
    scraped_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    category      VARCHAR(32),
    subcategory   VARCHAR(32),
    content_snippet TEXT,
    metadata      JSONB,
    event_date    TIMESTAMPTZ,
    title_hash    VARCHAR(32),
    ai_summary    TEXT
  );

  CREATE INDEX idx_posts_source_key   ON posts(source_key);
  CREATE INDEX idx_posts_scraped_at   ON posts(scraped_at DESC);
  CREATE INDEX idx_posts_category     ON posts(category);

  CREATE TABLE post_scores (
    id              BIGSERIAL PRIMARY KEY,
    post_id         BIGINT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
    trend_score     FLOAT DEFAULT 0,
    source_weight   FLOAT DEFAULT 1.0,
    category_weight FLOAT DEFAULT 1.0,
    velocity_bonus  FLOAT DEFAULT 1.0,
    cluster_bonus   FLOAT DEFAULT 1.0,
    trend_signal_bonus FLOAT DEFAULT 1.0,
    calculated_at   TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_post_scores_score ON post_scores(trend_score DESC);

  CREATE TABLE post_votes (
    id         SERIAL PRIMARY KEY,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    ip_hash    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX idx_post_votes_dedup   ON post_votes(post_id, ip_hash);
  CREATE INDEX idx_post_votes_post_id        ON post_votes(post_id);

  CREATE TABLE post_clusters (
    id                BIGSERIAL PRIMARY KEY,
    canonical_post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    member_count      INT DEFAULT 1,
    cluster_created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_clusters_canonical ON post_clusters(canonical_post_id);

  CREATE TABLE post_cluster_members (
    cluster_id       BIGINT NOT NULL REFERENCES post_clusters(id) ON DELETE CASCADE,
    post_id          BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    similarity_score FLOAT DEFAULT 1.0,
    match_layer      VARCHAR(4) NOT NULL DEFAULT 'L1',
    UNIQUE(cluster_id, post_id)
  );

  CREATE INDEX idx_cluster_members_post ON post_cluster_members(post_id);

  CREATE TABLE engagement_snapshots (
    id            BIGSERIAL PRIMARY KEY,
    post_id       BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    view_count    INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    like_count    INTEGER NOT NULL DEFAULT 0,
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE source_engagement_stats (
    source_key        VARCHAR(32) PRIMARY KEY,
    mean_log_views    FLOAT NOT NULL DEFAULT 0,
    stddev_log_views  FLOAT NOT NULL DEFAULT 1,
    mean_log_comments FLOAT NOT NULL DEFAULT 0,
    stddev_log_comments FLOAT NOT NULL DEFAULT 1,
    mean_log_likes    FLOAT NOT NULL DEFAULT 0,
    stddev_log_likes  FLOAT NOT NULL DEFAULT 1,
    sample_count      INTEGER NOT NULL DEFAULT 0,
    calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE trend_keywords (
    id         BIGSERIAL PRIMARY KEY,
    keyword    TEXT NOT NULL,
    source_key VARCHAR(32) NOT NULL,
    rank       INTEGER,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(keyword, source_key)
  );

  CREATE TABLE scoring_config (
    namespace VARCHAR(64) NOT NULL,
    key       VARCHAR(64) NOT NULL,
    value     TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );
`;

// ── Factory ────────────────────────────────────────────────

export interface TestDb {
  /** pg-mem Pool — drop-in replacement for node-postgres Pool */
  pool: Pool;
  /** Raw pg-mem instance for direct SQL or debugging */
  db: IMemoryDb;
  /** Teardown: end pool connections */
  teardown: () => Promise<void>;
}

/**
 * Create a fresh in-memory database with production schema.
 * Each call returns an isolated instance — safe for parallel tests.
 */
export function createTestDb(): TestDb {
  const db = newDb();

  // Register NOW() to return deterministic-ish value
  // pg-mem supports NOW() natively, no override needed

  // Apply schema
  db.public.none(SCHEMA_SQL);

  // Create pg Pool adapter
  const { Pool: PgMemPool } = db.adapters.createPg();
  const pool = new PgMemPool() as unknown as Pool;

  return {
    pool,
    db,
    teardown: async () => {
      // pg-mem pools don't need real cleanup, but match the interface
      await (pool as any).end?.();
    },
  };
}

// ── Test Data Helpers ──────────────────────────────────────

export interface TestPostInput {
  sourceKey?: string;
  sourceName?: string;
  title: string;
  url: string;
  category?: string;
  viewCount?: number;
  commentCount?: number;
  likeCount?: number;
  publishedAt?: Date;
  thumbnail?: string;
}

/**
 * Insert test posts into the in-memory DB.
 * Returns the inserted post IDs in insertion order.
 */
export async function insertTestPosts(
  pool: Pool,
  posts: readonly TestPostInput[],
): Promise<number[]> {
  const ids: number[] = [];

  for (const p of posts) {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO posts (source_key, source_name, title, url, category,
                          view_count, comment_count, like_count, published_at, thumbnail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        p.sourceKey ?? 'test_source',
        p.sourceName ?? '테스트',
        p.title,
        p.url,
        p.category ?? 'community',
        p.viewCount ?? 0,
        p.commentCount ?? 0,
        p.likeCount ?? 0,
        p.publishedAt ?? new Date(),
        p.thumbnail ?? null,
      ],
    );
    ids.push(result.rows[0].id);
  }

  return ids;
}
