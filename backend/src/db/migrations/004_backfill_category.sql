UPDATE posts SET category = CASE
  WHEN source_key IN ('khan','hankyung','mk','seoul','kmib') THEN 'news'
  WHEN source_key IN ('geeknews','yozm') THEN 'tech'
  WHEN source_key IN ('krx','investing_kr','sedaily') THEN 'finance'
  WHEN source_key = 'google_trends' THEN 'trend'
  WHEN source_key IN ('korea_press','korea_policy','korea_briefing') THEN 'government'
  WHEN source_key = 'uppity' THEN 'newsletter'
  WHEN source_key = 'ppomppu_hot' THEN 'deals'
  WHEN source_key = 'kma' THEN 'alert'
END WHERE category IS NULL AND source_key IN (
  'khan','hankyung','mk','seoul','kmib',
  'geeknews','yozm',
  'krx','google_trends',
  'korea_press','korea_policy','korea_briefing',
  'uppity','ppomppu_hot','kma'
);
