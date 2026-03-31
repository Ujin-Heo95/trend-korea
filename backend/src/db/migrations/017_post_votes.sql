-- Post votes: upvote system with IP-based dedup
ALTER TABLE posts ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS post_votes (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_votes_dedup ON post_votes(post_id, ip_hash);
CREATE INDEX IF NOT EXISTS idx_post_votes_post_id ON post_votes(post_id);
