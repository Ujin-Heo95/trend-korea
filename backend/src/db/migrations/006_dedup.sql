-- 006_dedup.sql: 3-Layer 중복제거 (title_hash + 클러스터링 테이블)

-- L1: 정규화 후 MD5 해시 (GENERATED 컬럼)
-- 정규화: [괄호내용] 제거 → 특수문자 제거(한글+영숫자+공백만) → 연속공백 → lowercase → trim
ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_hash VARCHAR(32)
  GENERATED ALWAYS AS (
    md5(
      lower(
        trim(
          regexp_replace(
            regexp_replace(
              regexp_replace(title, '\[[^\]]*\]', '', 'g'),
              '[^가-힣ㄱ-ㅎㅏ-ㅣa-z0-9\s]', '', 'gi'
            ),
            '\s+', ' ', 'g'
          )
        )
      )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_posts_title_hash ON posts(title_hash);

-- L3: thumbnail URL 매칭용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_posts_thumbnail ON posts(thumbnail) WHERE thumbnail IS NOT NULL;

-- 클러스터링 테이블
CREATE TABLE IF NOT EXISTS post_clusters (
  id BIGSERIAL PRIMARY KEY,
  canonical_post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  member_count INT DEFAULT 1,
  cluster_created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clusters_canonical ON post_clusters(canonical_post_id);

CREATE TABLE IF NOT EXISTS post_cluster_members (
  cluster_id BIGINT NOT NULL REFERENCES post_clusters(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  similarity_score FLOAT DEFAULT 1.0,
  match_layer VARCHAR(4) NOT NULL DEFAULT 'L1',
  UNIQUE(cluster_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_cluster_members_post ON post_cluster_members(post_id);
