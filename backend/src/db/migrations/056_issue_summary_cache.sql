-- Phase 3-4: 이슈 요약 캐시 (content fingerprint 기반)
-- 기존 stable_id + 1h TTL 캐시가 구성원 변동 없이도 매시간 재호출을 발생시키는 문제를 해소.
-- fingerprint = md5(sorted top-5 post_id + 대표 제목). 구성원 변경률 ≥ 0.3 이전까지 재사용.

CREATE TABLE IF NOT EXISTS issue_summary_cache (
  fingerprint TEXT PRIMARY KEY,
  headline TEXT NOT NULL,
  one_liner TEXT,
  bullets JSONB,
  sentiment TEXT,
  category TEXT,
  model TEXT NOT NULL,
  input_tokens INT,
  output_tokens INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_issue_summary_cache_created
  ON issue_summary_cache(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_issue_summary_cache_last_hit
  ON issue_summary_cache(last_hit_at DESC);
