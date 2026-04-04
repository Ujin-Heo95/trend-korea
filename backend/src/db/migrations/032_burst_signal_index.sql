-- Partial index for burst-validated signal types (scoring query optimization)
CREATE INDEX IF NOT EXISTS idx_trend_signals_burst_types
  ON trend_signals (keyword, convergence_score DESC)
  WHERE signal_type IN ('burst_confirmed', 'burst_naver', 'burst_google');
