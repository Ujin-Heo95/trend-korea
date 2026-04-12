-- 064_post_title_token_stats.sql
-- 이슈카드 과병합 근본 해결: 제목 토큰 DF + burst 통계.
--
-- v8 anchor 클러스터링은 임베딩 cosine ≥ 0.78 만으로 attach 한다.
-- 짧은 한국어 제목에서 Gemini 임베딩이 "집/아파트/주택" 같은 공통 일반명사
-- 1~2개에 과도하게 가중치를 부여해 무관한 사건이 같은 클러스터로 묶이는
-- 사고가 반복됨. 사용자가 직접 제기한 회귀 케이스 (2026-04-13).
--
-- 해결: 코퍼스 전체에서 토큰별 등장 빈도(DF)와 burst ratio 를 주기적으로
-- 집계해 두고, postClustering attach 단계에서 "두 제목이 high-IDF 토큰을
-- 최소 1개 공유하는가" 를 게이트로 검사한다. stopword 화이트리스트 없이
-- 데이터로 자동 차단.
--
-- 두 윈도우:
--   df_24h     : 최근 24h 등장 글 수 → 현재 rate
--   df_baseline: 최근 14d 등장 글 수 → baseline rate
-- burst_ratio = (df_24h / N_24h) / (df_baseline / N_baseline) 로 평소엔 흔하지만
-- 지금 폭증한 단어 ("집값" 폭등 등) 도 자동으로 게이트 통과시킨다.
SET LOCAL statement_timeout = 0;
SET LOCAL lock_timeout = '30s';

CREATE TABLE IF NOT EXISTS post_title_token_stats (
  token        TEXT PRIMARY KEY,
  df_24h       INT NOT NULL,
  df_baseline  INT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_title_token_stats_updated
  ON post_title_token_stats (updated_at DESC);

-- Singleton meta row: 코퍼스 전체 크기 (IDF 분모).
CREATE TABLE IF NOT EXISTS post_title_token_stats_meta (
  singleton          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  doc_count_24h      INT NOT NULL,
  doc_count_baseline INT NOT NULL,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
