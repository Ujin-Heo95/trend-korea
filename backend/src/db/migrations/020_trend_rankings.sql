-- 통합 트렌드 랭킹 위치변동 추적 + 품질 필터링
CREATE TABLE IF NOT EXISTS trend_rankings (
  keyword TEXT NOT NULL,
  rank INT NOT NULL,
  unified_score FLOAT NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (keyword, calculated_at)
);
CREATE INDEX IF NOT EXISTS idx_trend_rankings_time ON trend_rankings (calculated_at DESC);

-- 상시 키워드 억제 (Phase E)
CREATE TABLE IF NOT EXISTS keyword_suppressions (
  keyword TEXT PRIMARY KEY,
  reason VARCHAR(32) NOT NULL DEFAULT 'evergreen',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
