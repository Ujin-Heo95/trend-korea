-- Performance indexes v2: velocity query + issue rankings API
-- engagement_snapshots: velocity 쿼리 (captured_at 범위 스캔 + post_id)
CREATE INDEX IF NOT EXISTS idx_engagement_snapshots_captured_post
  ON engagement_snapshots(captured_at DESC, post_id);

-- issue_rankings: expires_at 필터 + issue_score 정렬 (부분 인덱스)
CREATE INDEX IF NOT EXISTS idx_issue_rankings_expires_score
  ON issue_rankings(expires_at, issue_score DESC)
  WHERE summary IS NOT NULL;
