-- 이슈 랭킹 시간대별 윈도우 지원 (6h/12h/24h 서브탭)
-- window_hours 컬럼 추가
ALTER TABLE issue_rankings ADD COLUMN IF NOT EXISTS window_hours SMALLINT NOT NULL DEFAULT 12;

-- 기존 stable_id unique 인덱스 → (stable_id, window_hours) 복합 유니크로 교체
DROP INDEX IF EXISTS idx_issue_rankings_stable_id_unique;
DROP INDEX IF EXISTS idx_issue_rankings_stable_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_rankings_stable_id_window
  ON issue_rankings (stable_id, window_hours) WHERE stable_id IS NOT NULL;

-- window별 스코어 조회 인덱스 (WHERE expires_at > NOW() 제거 — NOW()는 IMMUTABLE 아님)
CREATE INDEX IF NOT EXISTS idx_issue_rankings_window_score
  ON issue_rankings (window_hours, issue_score DESC);

-- materialized 테이블: window_hours 추가 + PK 재정의
ALTER TABLE issue_rankings_materialized ADD COLUMN IF NOT EXISTS window_hours SMALLINT NOT NULL DEFAULT 12;
ALTER TABLE issue_rankings_materialized DROP CONSTRAINT IF EXISTS issue_rankings_materialized_pkey;
ALTER TABLE issue_rankings_materialized ADD PRIMARY KEY (page, page_size, window_hours);
