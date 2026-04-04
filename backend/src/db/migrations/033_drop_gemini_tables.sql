-- Drop Gemini/keyword-dependent tables
-- These are no longer used after removing Gemini API and issue tag features

DROP TABLE IF EXISTS keyword_burst_explanations CASCADE;
DROP TABLE IF EXISTS keyword_extractions CASCADE;
DROP TABLE IF EXISTS keyword_stats CASCADE;
DROP TABLE IF EXISTS keyword_baselines CASCADE;
DROP TABLE IF EXISTS keyword_suppressions CASCADE;
DROP TABLE IF EXISTS mini_editorials CASCADE;
DROP TABLE IF EXISTS daily_report_sections CASCADE;
DROP TABLE IF EXISTS daily_reports CASCADE;
DROP TABLE IF EXISTS weekly_digests CASCADE;
DROP TABLE IF EXISTS trend_signals CASCADE;
DROP TABLE IF EXISTS trend_rankings CASCADE;

-- Remove ai_summary column from posts (Gemini-generated)
ALTER TABLE posts DROP COLUMN IF EXISTS ai_summary;
ALTER TABLE posts DROP COLUMN IF EXISTS ai_summarized_at;
