CREATE TABLE IF NOT EXISTS weekly_digests (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  digest TEXT NOT NULL,
  top_keywords TEXT[] NOT NULL DEFAULT '{}',
  outlook TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
