-- Add content_snippet column for storing article/video content previews (up to 500 chars)
-- Populated by: RSS feeds (39), YouTube API (2), Daum Search API (1)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_snippet TEXT;
