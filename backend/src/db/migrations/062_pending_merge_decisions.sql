-- 062: pending_merge_decisions
-- issueAggregator의 entity_borderline 병합 후보를 비동기 Gemini 중재자에게 위임하기 위한 큐.
-- critical path(aggregateIssues)에서 외부 HTTP I/O를 제거 → DB 풀 경합 + fallback 연쇄 근본 해소.

CREATE TABLE IF NOT EXISTS pending_merge_decisions (
  pair_hash      TEXT PRIMARY KEY,               -- MD5(sorted(title_a, title_b))
  post_a_id      BIGINT NOT NULL,
  post_b_id      BIGINT NOT NULL,
  title_a        TEXT NOT NULL,
  title_b        TEXT NOT NULL,
  cos            REAL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at     TIMESTAMPTZ,
  decision       BOOLEAN,                        -- TRUE=same_event, FALSE=different, NULL=pending
  source         TEXT                            -- 'gemini' | 'cache' | 'budget'
);

-- 워커가 pending만 빠르게 pick
CREATE INDEX IF NOT EXISTS idx_pmd_pending
  ON pending_merge_decisions (created_at)
  WHERE decided_at IS NULL;

-- aggregateIssues가 최근 결정된 pair를 빠르게 로드
CREATE INDEX IF NOT EXISTS idx_pmd_decided
  ON pending_merge_decisions (decided_at DESC)
  WHERE decided_at IS NOT NULL;
