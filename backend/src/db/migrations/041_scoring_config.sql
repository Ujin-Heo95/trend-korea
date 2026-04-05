-- 어드민에서 스코어링 알고리즘 상수를 실시간 조정할 수 있도록 설정 테이블 생성
CREATE TABLE IF NOT EXISTS scoring_config (
  id          SERIAL PRIMARY KEY,
  group_name  TEXT NOT NULL,
  config_key  TEXT NOT NULL,
  value_json  JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  TEXT DEFAULT 'system',
  UNIQUE (group_name, config_key)
);

CREATE INDEX IF NOT EXISTS idx_scoring_config_group ON scoring_config (group_name);
