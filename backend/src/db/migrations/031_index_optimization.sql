-- 031: Index optimization for common query patterns

-- post_scores lookup by post_id (explicit index for JOIN performance)
CREATE INDEX IF NOT EXISTS idx_post_scores_post_id ON post_scores(post_id);

-- scraper_runs: composite index for source health queries
CREATE INDEX IF NOT EXISTS idx_scraper_runs_source_started ON scraper_runs(source_key, started_at DESC);

-- keyword_stats: window + mention_count for top keywords queries
CREATE INDEX IF NOT EXISTS idx_keyword_stats_window_count ON keyword_stats(window_hours, mention_count DESC);
