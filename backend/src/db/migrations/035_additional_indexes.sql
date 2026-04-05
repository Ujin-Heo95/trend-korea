-- Category + recency composite index for filtered listing queries
CREATE INDEX IF NOT EXISTS idx_posts_category_scraped
  ON posts(category, scraped_at DESC);

-- Trigram index for ILIKE title search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_posts_title_trgm
  ON posts USING gin (title gin_trgm_ops);
