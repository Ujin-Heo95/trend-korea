-- 057_2track_scoring.sql
-- 2-Track 증분 스코어링 PR #1: post_scores 스키마 확장 (non-breaking)
-- 설계 문서: docs/decisions/2track-scoring-handoff.md
-- 이 마이그레이션은 컬럼만 추가하고 기존 스코어링 경로는 전혀 건드리지 않음.
--
-- NOTE: 최초 버전에는 UPDATE 백필이 있었으나 Supabase statement_timeout(2분)
-- 초과로 배포 실패. scoring.ts가 5분 주기로 trend_score_base/post_origin/
-- half_life_min을 매 실행마다 UPSERT하므로 백필은 불필요 — 제거함.

ALTER TABLE post_scores
  ADD COLUMN IF NOT EXISTS trend_score_base DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS half_life_min    INTEGER,
  ADD COLUMN IF NOT EXISTS post_origin      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decayed_at       TIMESTAMPTZ;

-- Track B가 24h 윈도 스캔 시 쓸 partial index
-- (partial 조건에 NOW() 같은 시간 함수 금지 — 055 IMMUTABLE 교훈)
CREATE INDEX IF NOT EXISTS idx_post_scores_post_origin
  ON post_scores (post_origin)
  WHERE post_origin IS NOT NULL;
