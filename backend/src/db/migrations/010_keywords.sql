-- 게시글별 키워드 추출 결과
CREATE TABLE IF NOT EXISTS keyword_extractions (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id)
);

CREATE INDEX IF NOT EXISTS idx_keyword_extractions_extracted_at
  ON keyword_extractions(extracted_at);

-- 시간 윈도우별 키워드 집계 캐싱
CREATE TABLE IF NOT EXISTS keyword_stats (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 0,
  rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  window_hours INTEGER NOT NULL DEFAULT 3,
  total_posts INTEGER NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(keyword, window_hours)
);

CREATE INDEX IF NOT EXISTS idx_keyword_stats_window
  ON keyword_stats(window_hours, rate DESC);
