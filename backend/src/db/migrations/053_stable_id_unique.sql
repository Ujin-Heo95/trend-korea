-- stable_id UNIQUE 제약 추가 (점진적 UPSERT 지원)
-- 기존 중복 제거 후 제약 추가
DELETE FROM issue_rankings a USING issue_rankings b
WHERE a.id < b.id AND a.stable_id = b.stable_id AND a.stable_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_rankings_stable_id_unique
  ON issue_rankings(stable_id) WHERE stable_id IS NOT NULL;
