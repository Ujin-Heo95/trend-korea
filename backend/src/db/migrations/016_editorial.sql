-- 일일 리포트 에디토리얼 컬럼 추가
ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS editorial_keywords TEXT,
  ADD COLUMN IF NOT EXISTS editorial_briefing TEXT,
  ADD COLUMN IF NOT EXISTS editorial_watch_point TEXT;
