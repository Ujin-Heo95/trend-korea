-- 키워드 베이스라인: EMA 기반 Z-Score 버스트 감지용
CREATE TABLE IF NOT EXISTS keyword_baselines (
  keyword TEXT PRIMARY KEY,
  mean_rate FLOAT NOT NULL DEFAULT 0.5,
  stddev_rate FLOAT NOT NULL DEFAULT 0.3,
  sample_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
