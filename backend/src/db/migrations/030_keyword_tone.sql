-- 키워드 추출 시 게시글 톤 분류 저장
ALTER TABLE keyword_extractions ADD COLUMN IF NOT EXISTS tone TEXT;

-- 키워드별 집계 시 대표 톤 저장
ALTER TABLE keyword_stats ADD COLUMN IF NOT EXISTS dominant_tone TEXT;
