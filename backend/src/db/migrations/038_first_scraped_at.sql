-- 최초 수집 시각: INSERT 시에만 설정, UPSERT 시 갱신하지 않음
-- 목적: published_at이 NULL인 커뮤니티 글의 게시 시점 근사치
ALTER TABLE posts ADD COLUMN IF NOT EXISTS first_scraped_at TIMESTAMPTZ;

-- 기존 데이터 백필: published_at 있으면 사용, 없으면 scraped_at
UPDATE posts SET first_scraped_at = COALESCE(published_at, scraped_at)
WHERE first_scraped_at IS NULL;

-- NOT NULL 제약 + 기본값
ALTER TABLE posts ALTER COLUMN first_scraped_at SET DEFAULT NOW();
ALTER TABLE posts ALTER COLUMN first_scraped_at SET NOT NULL;

-- 정렬용 인덱스
CREATE INDEX IF NOT EXISTS idx_posts_first_scraped_at ON posts(first_scraped_at DESC);
