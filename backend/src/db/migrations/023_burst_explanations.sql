-- 키워드 급상승 이유 설명 (6시간 TTL, 애플리케이션에서 만료 관리)
CREATE TABLE IF NOT EXISTS keyword_burst_explanations (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  z_score NUMERIC(5,2) NOT NULL,
  explanation TEXT NOT NULL,
  related_titles TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '6 hours'
);
