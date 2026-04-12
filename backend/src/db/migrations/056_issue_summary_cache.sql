-- Phase 3-4: 이슈 요약 캐시 (content fingerprint 기반)
-- 기존 stable_id + 1h TTL 인메모리 캐시가 재시작/다중 인스턴스에서 휘발되고
-- 클러스터 구성원 변동 없이도 매시간 재호출을 발생시키는 문제를 해소.
--
-- fingerprint = md5(sorted top-5 post_id). 구성원 변경률 ≥ 0.3 이전까지 재사용.
-- 스키마는 IssueSummary (geminiSummarizer.ts) 형태와 1:1 매칭.

CREATE TABLE IF NOT EXISTS issue_summary_cache (
  fingerprint   TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  summary       TEXT NOT NULL,
  quality_score INT,
  keywords      JSONB,
  sentiment     TEXT,
  top_post_ids  BIGINT[] NOT NULL,
  model         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_hit_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count     INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_issue_summary_cache_last_hit
  ON issue_summary_cache(last_hit_at DESC);
