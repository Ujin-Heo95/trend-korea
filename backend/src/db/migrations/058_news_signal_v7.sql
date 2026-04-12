-- TD-005: 뉴스 signalScore v7 — freshness 흡수 + entity 기반 clusterImportance
-- v6 news_signal_weights (portal/cluster/trend/engagement = 0.35/0.30/0.20/0.15)를
-- v7 5항 가산 (+ freshness 0.10)로 교체. 외곽 freshnessBonus 곱셈 제거에 대응하여
-- halfLife decay와 이중 계산되던 문제 해소.
--
-- 가중치: portal 0.32 + cluster 0.27 + trend 0.18 + engagement 0.13 + freshness 0.10 = 1.00
-- clusterImportance는 임베딩 centroid 거리 기반 (calculateClusterImportanceMapV7).
-- 임베딩이 ≥2개 있는 클러스터는 v7, 없으면 per-cluster로 v6 공식 fallback.

INSERT INTO scoring_config (group_name, config_key, value_json, updated_by) VALUES
  ('news_signal_weights_v7', 'portal_weight',     '0.32'::jsonb, 'migration_058'),
  ('news_signal_weights_v7', 'cluster_weight',    '0.27'::jsonb, 'migration_058'),
  ('news_signal_weights_v7', 'trend_weight',      '0.18'::jsonb, 'migration_058'),
  ('news_signal_weights_v7', 'engagement_weight', '0.13'::jsonb, 'migration_058'),
  ('news_signal_weights_v7', 'freshness_weight',  '0.10'::jsonb, 'migration_058')
ON CONFLICT (group_name, config_key) DO NOTHING;
