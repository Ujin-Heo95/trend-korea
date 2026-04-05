-- Issue Rankings v2: 영상 트래킹 + 교차검증 + 순위 변동 + stable hash

-- 영상 트래킹
ALTER TABLE issue_rankings ADD COLUMN IF NOT EXISTS video_score FLOAT NOT NULL DEFAULT 0;
ALTER TABLE issue_rankings ADD COLUMN IF NOT EXISTS video_post_count INT DEFAULT 0;

-- 교차검증
ALTER TABLE issue_rankings ADD COLUMN IF NOT EXISTS cross_validation_score FLOAT NOT NULL DEFAULT 0;
ALTER TABLE issue_rankings ADD COLUMN IF NOT EXISTS cross_validation_sources TEXT[] DEFAULT '{}';

-- 순위 변동 (null=NEW, 0=동일, +N=상승, -N=하락)
ALTER TABLE issue_rankings ADD COLUMN IF NOT EXISTS rank_change INT;

-- 이슈 영속 ID (cluster_ids 기반 stable hash — 5분 갱신에도 유지)
ALTER TABLE issue_rankings ADD COLUMN IF NOT EXISTS stable_id TEXT;
CREATE INDEX IF NOT EXISTS idx_issue_rankings_stable_id ON issue_rankings(stable_id);

-- 순위 스냅샷 히스토리 (1시간 주기 저장, 7일 보관)
CREATE TABLE IF NOT EXISTS issue_rankings_history (
  id SERIAL PRIMARY KEY,
  batch_id TIMESTAMPTZ NOT NULL,
  rank_position INT NOT NULL,
  title TEXT NOT NULL,
  issue_score FLOAT NOT NULL,
  stable_id TEXT,
  cluster_ids INT[] NOT NULL DEFAULT '{}',
  standalone_post_ids INT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_irh_batch ON issue_rankings_history(batch_id);
CREATE INDEX IF NOT EXISTS idx_irh_stable_id ON issue_rankings_history(stable_id);
