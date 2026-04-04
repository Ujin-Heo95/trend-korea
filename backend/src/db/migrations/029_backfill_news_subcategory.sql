-- 기존 뉴스 포스트의 subcategory 백필 (URL 패턴 + 소스 기본값)
UPDATE posts SET subcategory = CASE
  -- 경제지 기본값
  WHEN source_key IN ('hankyung', 'mk') THEN '경제'
  -- URL 패턴 매칭
  WHEN url ~* '/(politics|정치|pol)/' THEN '정치'
  WHEN url ~* '/(economy|경제|econo|money|finance)/' THEN '경제'
  WHEN url ~* '/(society|사회|soc|national)/' THEN '사회'
  WHEN url ~* '/(international|world|global|세계|foreign)/' THEN '세계'
  WHEN url ~* '/(entertain|culture|연예|ent|celeb)/' THEN '연예'
  WHEN url ~* '/(sports?|스포츠)/' THEN '스포츠'
  WHEN url ~* '/(science|tech|it|digital|과학|ICT)/' THEN 'IT/과학'
  WHEN url ~* '/(life|living|health|생활|라이프|wellness)/' THEN '생활'
  ELSE NULL
END
WHERE category = 'news' AND subcategory IS NULL;
