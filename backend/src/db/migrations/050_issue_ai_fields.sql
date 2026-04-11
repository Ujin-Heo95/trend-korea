-- Gemini 응답 확장: 품질 점수 + AI 키워드 + 감성 분석
ALTER TABLE issue_rankings ADD COLUMN IF NOT EXISTS quality_score SMALLINT;
ALTER TABLE issue_rankings ADD COLUMN IF NOT EXISTS ai_keywords TEXT[] DEFAULT '{}';
ALTER TABLE issue_rankings ADD COLUMN IF NOT EXISTS sentiment TEXT;
