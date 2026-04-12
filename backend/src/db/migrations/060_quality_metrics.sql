-- 060_quality_metrics.sql
-- 품질 플라이휠 Stage 1 — 자동 품질 메트릭 적재
-- 설계: ~/.claude/plans/reflective-twirling-horizon.md
--
-- 매 10분 tick에서 qualityMetricsBatch가 ~30 메트릭을 계산해 이 테이블에 적재.
-- 사람 검수 없이 회귀/이상을 즉시 감지하기 위한 데이터 기반.
SET LOCAL statement_timeout = 0;
SET LOCAL lock_timeout = '30s';

CREATE TABLE IF NOT EXISTS quality_metrics (
  id BIGSERIAL PRIMARY KEY,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_name TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  dim JSONB
);

-- 시계열 조회용
CREATE INDEX IF NOT EXISTS idx_quality_metrics_name_time
  ON quality_metrics (metric_name, computed_at DESC);

-- 최근 N분 윈도우 cleanup용
CREATE INDEX IF NOT EXISTS idx_quality_metrics_computed
  ON quality_metrics (computed_at DESC);
