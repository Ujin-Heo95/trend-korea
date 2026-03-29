-- 일일 리포트 테이블
CREATE TABLE IF NOT EXISTS daily_reports (
  id BIGSERIAL PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(32) DEFAULT 'draft',
  view_count INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_report_sections (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  category VARCHAR(32) NOT NULL,
  rank INT NOT NULL,
  post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source_name TEXT,
  view_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  cluster_size INT DEFAULT 1,
  summary TEXT,
  category_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_report_sections_report ON daily_report_sections(report_id);
