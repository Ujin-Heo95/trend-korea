-- 015_apify_usage.sql: Apify Actor 실행 비용 추적
CREATE TABLE IF NOT EXISTS apify_usage (
  id            SERIAL PRIMARY KEY,
  actor_id      TEXT         NOT NULL,
  source_key    VARCHAR(64)  NOT NULL,
  cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
  items_count   INTEGER      NOT NULL DEFAULT 0,
  executed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_apify_usage_month ON apify_usage (date_trunc('month', executed_at));
