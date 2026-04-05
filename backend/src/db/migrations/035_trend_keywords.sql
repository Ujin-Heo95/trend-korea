-- 외부 트렌드 신호 키워드 테이블 (Google Trends, Naver DataLab, BigKinds)
-- 기존 스크래퍼 데이터를 재가공하여 포스트 타이틀 매칭에 사용
CREATE TABLE IF NOT EXISTS trend_keywords (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  keyword_normalized TEXT NOT NULL,
  source_key VARCHAR(50) NOT NULL,
  signal_strength FLOAT DEFAULT 0,
  metadata JSONB,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '12 hours',
  UNIQUE(keyword_normalized, source_key)
);

CREATE INDEX IF NOT EXISTS idx_trend_keywords_expires ON trend_keywords(expires_at);
