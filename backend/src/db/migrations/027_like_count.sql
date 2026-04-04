-- like_count 필드 확장: 좋아요/추천 수 수집
ALTER TABLE posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_posts_like_count ON posts(like_count DESC);

ALTER TABLE engagement_snapshots ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE source_engagement_stats
  ADD COLUMN IF NOT EXISTS mean_log_likes FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stddev_log_likes FLOAT NOT NULL DEFAULT 1;
