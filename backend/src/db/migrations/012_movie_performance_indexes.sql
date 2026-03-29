-- 012: Movie/Performance 조회 최적화 인덱스

-- scraper_runs에서 source별 최신 성공 실행 빠르게 조회
CREATE INDEX IF NOT EXISTS idx_scraper_runs_source_finished
ON scraper_runs (source_key, finished_at DESC)
WHERE error_message IS NULL;

-- movie/performance 카테고리 TTL 정리 최적화
CREATE INDEX IF NOT EXISTS idx_posts_category_scraped
ON posts (category, scraped_at)
WHERE category IN ('movie', 'performance');
