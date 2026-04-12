-- 061_issue_quality_judgments.sql
-- 품질 플라이휠 Stage 2 — LLM-as-Judge 오프라인 평가 결과 적재
-- 설계: ~/.claude/plans/reflective-twirling-horizon.md
--
-- 매일 02:00 KST qualityJudge 배치가 전일 24h top 30 이슈를 Gemini Flash Lite로 평가.
-- coherence/title/summary 점수 + outlier post_id + primary topic을 보존해
-- 휴리스틱 메트릭이 잡지 못하는 의미적 품질 회귀를 추적한다.
SET LOCAL statement_timeout = 0;
SET LOCAL lock_timeout = '30s';

CREATE TABLE IF NOT EXISTS issue_quality_judgments (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT,
  stable_id TEXT,
  judged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  coherence_score DOUBLE PRECISION,
  title_quality DOUBLE PRECISION,
  summary_quality DOUBLE PRECISION,
  outlier_post_ids INT[] DEFAULT '{}',
  primary_topic TEXT,
  explanation TEXT,
  judge_model TEXT,
  judge_cost_usd DOUBLE PRECISION,
  prompt_tokens INT,
  completion_tokens INT
);

CREATE INDEX IF NOT EXISTS idx_iqj_judged_at
  ON issue_quality_judgments (judged_at DESC);

CREATE INDEX IF NOT EXISTS idx_iqj_stable
  ON issue_quality_judgments (stable_id);

CREATE INDEX IF NOT EXISTS idx_iqj_coherence
  ON issue_quality_judgments (coherence_score);
