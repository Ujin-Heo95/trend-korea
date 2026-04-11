-- 이슈 API 응답 사전계산 테이블
CREATE TABLE IF NOT EXISTS issue_rankings_materialized (
  page INT NOT NULL,
  page_size INT NOT NULL,
  total INT NOT NULL,
  response_json JSONB NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (page, page_size)
);
