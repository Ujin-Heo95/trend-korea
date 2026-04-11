-- 임베딩 DB 영속화: 서버 재시작 시 Gemini API 재호출 방지
CREATE TABLE IF NOT EXISTS post_embeddings (
  post_id BIGINT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  embedding FLOAT4[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 최근 임베딩 로드용 인덱스
CREATE INDEX IF NOT EXISTS idx_post_embeddings_created
  ON post_embeddings(created_at DESC);
