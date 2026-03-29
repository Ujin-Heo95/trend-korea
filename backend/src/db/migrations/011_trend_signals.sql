-- 교차 검증 트렌드 시그널 (Google Trends × Naver DataLab × 커뮤니티)
CREATE TABLE IF NOT EXISTS trend_signals (
  id                BIGSERIAL PRIMARY KEY,
  keyword           TEXT NOT NULL,
  google_traffic    TEXT,
  google_traffic_num INTEGER DEFAULT 0,
  google_post_id    BIGINT REFERENCES posts(id) ON DELETE SET NULL,
  naver_recent      INTEGER,
  naver_previous    INTEGER,
  naver_change_pct  INTEGER,
  community_mentions INTEGER DEFAULT 0,
  community_sources TEXT[] DEFAULT '{}',
  convergence_score FLOAT DEFAULT 0,
  signal_type       VARCHAR(20) DEFAULT 'google_only',
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trend_signals_kw_date
  ON trend_signals (keyword, (detected_at::date));
CREATE INDEX IF NOT EXISTS idx_trend_signals_score
  ON trend_signals (convergence_score DESC);
CREATE INDEX IF NOT EXISTS idx_trend_signals_expires
  ON trend_signals (expires_at);
