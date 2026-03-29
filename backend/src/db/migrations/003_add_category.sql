ALTER TABLE posts ADD COLUMN IF NOT EXISTS category VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);

UPDATE posts SET category = CASE
  WHEN source_key IN ('dcinside','bobaedream','ruliweb','theqoo','instiz','natepann','ppomppu','todayhumor') THEN 'community'
  WHEN source_key = 'youtube' THEN 'video'
  WHEN source_key IN ('yna','hani','sbs','donga') THEN 'news'
END WHERE category IS NULL;
