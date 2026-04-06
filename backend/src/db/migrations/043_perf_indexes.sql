-- Performance indexes for scoring pipeline & issue queries
-- post_cluster_members: cluster_id lookup for issue detail & issues API
CREATE INDEX IF NOT EXISTS idx_pcm_cluster_post
  ON post_cluster_members(cluster_id, post_id);

-- posts: source stats aggregation (scoring-helpers.ts, every 5 min)
CREATE INDEX IF NOT EXISTS idx_posts_source_scraped_view
  ON posts(source_key, scraped_at DESC) WHERE view_count > 0;

-- issue_rankings_history: batch lookup for rank change calculation
CREATE INDEX IF NOT EXISTS idx_irh_batch
  ON issue_rankings_history(batch_id);
