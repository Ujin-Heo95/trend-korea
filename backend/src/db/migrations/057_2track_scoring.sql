-- 057_2track_scoring.sql
-- 2-Track 증분 스코어링 PR #1: post_scores 스키마 확장 + 백필 (non-breaking)
-- 설계 문서: docs/decisions/2track-scoring-handoff.md
-- 이 마이그레이션은 컬럼만 추가하고 기존 스코어링 경로는 전혀 건드리지 않음.

ALTER TABLE post_scores
  ADD COLUMN IF NOT EXISTS trend_score_base DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS half_life_min    INTEGER,
  ADD COLUMN IF NOT EXISTS post_origin      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decayed_at       TIMESTAMPTZ;

-- 백필: 기존 trend_score를 decay 1배(=base)로 간주, post_origin은 posts 조인
UPDATE post_scores ps
   SET trend_score_base = ps.trend_score,
       post_origin      = COALESCE(p.published_at, p.first_scraped_at, p.scraped_at)
  FROM posts p
 WHERE ps.post_id = p.id
   AND ps.trend_score_base IS NULL;

-- Track B가 24h 윈도 스캔 시 쓸 partial index
-- (partial 조건에 NOW() 같은 시간 함수 금지 — 055 IMMUTABLE 교훈)
CREATE INDEX IF NOT EXISTS idx_post_scores_post_origin
  ON post_scores (post_origin)
  WHERE post_origin IS NOT NULL;
