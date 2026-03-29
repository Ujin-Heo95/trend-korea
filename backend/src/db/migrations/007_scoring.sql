-- 007_scoring.sql: 트렌드 스코어링 테이블

CREATE TABLE IF NOT EXISTS post_scores (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  trend_score FLOAT DEFAULT 0,
  source_weight FLOAT DEFAULT 1.0,
  category_weight FLOAT DEFAULT 1.0,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_scores_score ON post_scores(trend_score DESC);
