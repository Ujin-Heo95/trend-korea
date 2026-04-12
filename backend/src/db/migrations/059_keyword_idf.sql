-- 059_keyword_idf.sql
-- 이슈 과병합 근본 해결: IDF 동적 가중 — Phase 1
-- 설계 문서: ~/.claude/plans/reflective-twirling-horizon.md
--
-- trend_keywords의 "광범위함"을 최근 코퍼스 DF로 자동 측정.
-- mergeViaTrendKeywords의 단일 키워드 공유 병합을 IDF 합 기반으로 전환하기 위한 데이터 소스.
-- Phase 1은 테이블/배치/모니터링만 추가 (병합 로직은 그대로) — IDF 분포를 1일 관찰 후 Phase 2에서 활성화.
SET LOCAL statement_timeout = 0;
SET LOCAL lock_timeout = '30s';

CREATE TABLE IF NOT EXISTS keyword_idf (
  keyword_normalized TEXT PRIMARY KEY,
  df INT NOT NULL,
  idf DOUBLE PRECISION NOT NULL,
  doc_count INT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keyword_idf_computed
  ON keyword_idf (computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_keyword_idf_idf
  ON keyword_idf (idf);
