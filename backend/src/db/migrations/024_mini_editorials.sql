-- 실시간 미니 에디토리얼 (3시간마다 생성)
CREATE TABLE IF NOT EXISTS mini_editorials (
  id SERIAL PRIMARY KEY,
  briefing TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  topic_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mini_editorial_created ON mini_editorials(created_at DESC);
