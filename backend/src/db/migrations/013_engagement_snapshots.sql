-- Engagement 스냅샷: 스크래핑 시점마다 조회수/댓글수 기록 → velocity 계산용
CREATE TABLE IF NOT EXISTS engagement_snapshots (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  view_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_snapshots_post
  ON engagement_snapshots(post_id, captured_at DESC);

-- 소스별 engagement 통계: Z-Score 정규화용
CREATE TABLE IF NOT EXISTS source_engagement_stats (
  source_key VARCHAR(32) PRIMARY KEY,
  mean_log_views FLOAT NOT NULL DEFAULT 0,
  stddev_log_views FLOAT NOT NULL DEFAULT 1,
  mean_log_comments FLOAT NOT NULL DEFAULT 0,
  stddev_log_comments FLOAT NOT NULL DEFAULT 1,
  sample_count INTEGER NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
