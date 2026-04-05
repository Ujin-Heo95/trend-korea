-- Issue Rankings: 이슈(토픽) 단위 순위 집계 테이블
CREATE TABLE IF NOT EXISTS issue_rankings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  category_label TEXT,
  issue_score FLOAT NOT NULL DEFAULT 0,
  news_score FLOAT NOT NULL DEFAULT 0,
  community_score FLOAT NOT NULL DEFAULT 0,
  trend_signal_score FLOAT NOT NULL DEFAULT 0,
  news_post_count INT DEFAULT 0,
  community_post_count INT DEFAULT 0,
  representative_thumbnail TEXT,
  cluster_ids INT[] NOT NULL DEFAULT '{}',
  standalone_post_ids INT[] NOT NULL DEFAULT '{}',
  matched_trend_keywords TEXT[] DEFAULT '{}',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '6 hours'
);

CREATE INDEX IF NOT EXISTS idx_issue_rankings_score ON issue_rankings(issue_score DESC);
CREATE INDEX IF NOT EXISTS idx_issue_rankings_expires ON issue_rankings(expires_at);
