CREATE TABLE IF NOT EXISTS scraper_runs (
  id            BIGSERIAL    PRIMARY KEY,
  source_key    VARCHAR(32)  NOT NULL,
  started_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  posts_saved   INTEGER,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scraper_runs_source_key ON scraper_runs(source_key);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_started_at ON scraper_runs(started_at DESC);
