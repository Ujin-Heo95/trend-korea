-- 기존 finance 카테고리 게시글에 subcategory '경제' 설정
UPDATE posts SET subcategory = '경제'
WHERE category = 'finance' AND subcategory IS NULL;
