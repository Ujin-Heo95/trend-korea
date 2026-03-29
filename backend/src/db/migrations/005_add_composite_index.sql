CREATE INDEX IF NOT EXISTS idx_posts_category_scraped_at
  ON posts(category, scraped_at DESC);
