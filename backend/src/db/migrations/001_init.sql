CREATE TABLE IF NOT EXISTS posts (
  id            BIGSERIAL PRIMARY KEY,
  source_key    VARCHAR(32)  NOT NULL,
  source_name   VARCHAR(64)  NOT NULL,
  title         TEXT         NOT NULL,
  url           TEXT         NOT NULL UNIQUE,
  thumbnail     TEXT,
  author        VARCHAR(128),
  view_count    INTEGER      DEFAULT 0,
  comment_count INTEGER      DEFAULT 0,
  published_at  TIMESTAMPTZ,
  scraped_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_source_key  ON posts(source_key);
CREATE INDEX IF NOT EXISTS idx_posts_scraped_at  ON posts(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_view_count  ON posts(view_count DESC);
