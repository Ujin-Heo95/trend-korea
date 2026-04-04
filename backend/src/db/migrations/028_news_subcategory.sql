-- 뉴스 서브카테고리 (사회, 경제, 생활, IT/과학, 세계, 연예, 스포츠, 정치)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS subcategory VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_posts_subcategory
  ON posts(subcategory) WHERE subcategory IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_category_subcategory
  ON posts(category, subcategory) WHERE category = 'news';
