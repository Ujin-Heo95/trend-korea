import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { DEFAULT_HALF_LIFE_MINUTES } from './scoring-weights.js';

/**
 * Track B — decay-only inplace updater.
 *
 * 설계: `docs/decisions/2track-scoring-handoff.md` (2-Track 증분 스코어링 PR #2)
 *
 * 24h 윈도 내 post_scores 행에 대해 `trend_score = trend_score_base * exp(-ln2 * age/halfLife)`
 * 한 방 SQL UPDATE. 크로스-post 집계 의존이 없어 Track A(풀 스코어링)와 독립적으로 실행 가능.
 *
 * 비활성화된 기본값은 `scoring_track_b_enabled` feature flag로 제어.
 * PR #2 단계에서는 legacy calculateScores 가 10분 cron 에서 계속 돌며 trend_score 를 덮어쓰므로,
 * Track B는 legacy와 병행 동작하며 staging A/B 검증 대상이 된다.
 */

const LEGACY_FALLBACK_HALF_LIFE = DEFAULT_HALF_LIFE_MINUTES; // 300 min
const WINDOW_HOURS = 24;

export interface DecayUpdateResult {
  readonly updated: number;
  readonly durationMs: number;
}

export async function runTrackBDecay(pool: Pool): Promise<DecayUpdateResult> {
  const startedAt = Date.now();
  // NOTE: half_life_min NULL 은 legacy calculateScores 가 아직 덮어쓰지 않은 백필 행(057).
  //       안전 폴백으로 DEFAULT_HALF_LIFE_MINUTES 주입 (설계 문서 NULL 처리 안 A).
  //       post_origin IS NULL 행은 제외 — 백필에서 COALESCE 실패한 경우 (매우 드묾).
  const result = await pool.query(
    `
    UPDATE post_scores
       SET trend_score = trend_score_base
                       * exp(
                           -0.6931471805599453
                           * GREATEST(
                               (EXTRACT(EPOCH FROM NOW()) - EXTRACT(EPOCH FROM post_origin)) / 60,
                               0
                             )
                           / COALESCE(half_life_min, $1)
                         ),
           decayed_at = NOW()
     WHERE post_origin IS NOT NULL
       AND trend_score_base IS NOT NULL
       AND (EXTRACT(EPOCH FROM NOW()) - EXTRACT(EPOCH FROM post_origin)) < ${WINDOW_HOURS} * 3600
    `,
    [LEGACY_FALLBACK_HALF_LIFE],
  );
  const durationMs = Date.now() - startedAt;
  const updated = result.rowCount ?? 0;
  logger.info({ updated, durationMs }, '[decayUpdater] track B decay applied');
  return { updated, durationMs };
}
