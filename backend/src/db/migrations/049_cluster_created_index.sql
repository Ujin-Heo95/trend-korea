-- 속보 감지 + 클러스터 보너스 + 클러스터 중요도 쿼리 가속
CREATE INDEX IF NOT EXISTS idx_post_clusters_created_at
  ON post_clusters(cluster_created_at DESC);
