CREATE TABLE IF NOT EXISTS scraper_source_overrides (
  source_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
