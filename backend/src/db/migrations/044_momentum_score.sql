-- Add momentum_score column to issue_rankings
ALTER TABLE issue_rankings
  ADD COLUMN IF NOT EXISTS momentum_score FLOAT NOT NULL DEFAULT 1.0;

-- Add to history table as well
ALTER TABLE issue_rankings_history
  ADD COLUMN IF NOT EXISTS momentum_score FLOAT NOT NULL DEFAULT 1.0;
