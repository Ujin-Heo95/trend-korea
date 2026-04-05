-- 스코어 분해 컬럼: 디버깅·튜닝용 개별 팩터 기록
ALTER TABLE post_scores ADD COLUMN IF NOT EXISTS velocity_bonus FLOAT DEFAULT 1.0;
ALTER TABLE post_scores ADD COLUMN IF NOT EXISTS cluster_bonus FLOAT DEFAULT 1.0;
ALTER TABLE post_scores ADD COLUMN IF NOT EXISTS trend_signal_bonus FLOAT DEFAULT 1.0;
