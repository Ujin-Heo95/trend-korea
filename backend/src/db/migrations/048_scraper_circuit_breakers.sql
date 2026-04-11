CREATE TABLE IF NOT EXISTS scraper_circuit_breakers (
  source_key TEXT PRIMARY KEY,
  consecutive_failures INT NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
