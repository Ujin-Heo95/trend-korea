-- 014: 교차 검증 트렌드에 컨텍스트 + 관련 게시글 + 시계열 추가
ALTER TABLE trend_signals
  ADD COLUMN IF NOT EXISTS context_title TEXT,
  ADD COLUMN IF NOT EXISTS related_post_ids BIGINT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS naver_trend_data JSONB;

-- keyword_extractions 키워드 검색 성능 개선
CREATE INDEX IF NOT EXISTS idx_keyword_extractions_keywords_gin
  ON keyword_extractions USING GIN (keywords);
