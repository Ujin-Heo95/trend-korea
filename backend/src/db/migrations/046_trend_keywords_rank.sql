-- 실시간 검색어 순위 데이터를 정규 칼럼으로 구조화
ALTER TABLE trend_keywords ADD COLUMN IF NOT EXISTS rank_position SMALLINT;
ALTER TABLE trend_keywords ADD COLUMN IF NOT EXISTS rank_direction VARCHAR(4);
ALTER TABLE trend_keywords ADD COLUMN IF NOT EXISTS rank_change SMALLINT DEFAULT 0;

COMMENT ON COLUMN trend_keywords.rank_position IS '실시간 검색어 순위 (1=최상위, NULL=비순위 소스)';
COMMENT ON COLUMN trend_keywords.rank_direction IS '순위 변동 방향: + 상승, - 하락, n 신규, = 유지';
COMMENT ON COLUMN trend_keywords.rank_change IS '순위 변동폭 (절대값)';

CREATE INDEX IF NOT EXISTS idx_trend_keywords_rank ON trend_keywords(source_key, rank_position)
  WHERE rank_position IS NOT NULL;
