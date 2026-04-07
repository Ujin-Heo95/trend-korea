-- 전시/공연 등 이벤트 시작일 칼럼 (published_at과 의미 분리)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ;
COMMENT ON COLUMN posts.event_date IS '전시/공연 이벤트 시작일 — published_at(발행일)과 구분';

-- 기존 KCISA 데이터: 미래 published_at → event_date로 이동
UPDATE posts
SET event_date = published_at,
    published_at = first_scraped_at
WHERE source_key IN ('kcisa_cca_exhibition', 'kcisa_cca_performance', 'kcisa_performance', 'kcisa_event', 'kcisa_festival')
  AND published_at > NOW();
