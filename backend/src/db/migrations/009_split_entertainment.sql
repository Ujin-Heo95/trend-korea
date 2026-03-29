-- Add metadata JSONB column for structured source data
ALTER TABLE posts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Split entertainment → movie / performance
UPDATE posts SET category = 'movie' WHERE source_key = 'kobis_boxoffice' AND category = 'entertainment';
UPDATE posts SET category = 'performance' WHERE source_key = 'kopis_boxoffice' AND category = 'entertainment';
