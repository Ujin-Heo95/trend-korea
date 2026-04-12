/**
 * Summary queue — TD-006 Round 5
 *
 * Priority formula (from docs/decisions/TD-006-gemini-summary-queue.md):
 *
 *   priority = issueScore
 *            × freshnessFactor         # 6h half-life decay from calculated_at
 *            × unsummarizedPenalty     # [1.0, 3.0] — null/fallback = max
 *            × noveltyFactor           # 1.2 when Jaccard distance ≥ 0.3 vs prev tick
 *
 * Novelty comparison uses an in-memory snapshot keyed by stable_id.
 * The snapshot lives for the process lifetime (rebuilt on restart) and is
 * bounded to MAX_SNAPSHOT to prevent unbounded growth. This is intentional —
 * persisting to a table would add I/O for a signal that degrades fast anyway.
 */
import type { Pool } from 'pg';
import { memberChangeRate } from './issueSummaryCache.js';
import { ScoringConfigProvider } from './scoringConfig.js';

export interface QueueConfig {
  readonly freshnessHalfLifeHours: number;
  readonly unsummarizedPenaltyMin: number;
  readonly unsummarizedPenaltyMax: number;
  readonly noveltyFactor: number;
  readonly noveltyThreshold: number;
  readonly phaseTimeoutMs: number;
  readonly singleCallTimeoutMs: number;
  readonly maxIssuesPerWindow: number;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  freshnessHalfLifeHours: 6,
  unsummarizedPenaltyMin: 1.0,
  unsummarizedPenaltyMax: 3.0,
  noveltyFactor: 1.2,
  noveltyThreshold: 0.3,
  // 45s hard cap — advisory lock과 이중 안전망. 다음 cron tick(:09→:14)과 절대 겹치지 않도록 물리적 상한.
  phaseTimeoutMs: 45_000,
  singleCallTimeoutMs: 15_000,
  maxIssuesPerWindow: 15,
};

export interface QueueBuildRow {
  readonly rowId: number;
  readonly stableId: string | null;
  readonly issueScore: number;
  readonly calculatedAt: Date;
  readonly summary: string | null;
  readonly topPostIds: readonly number[];
}

export interface QueueItem {
  readonly rowId: number;
  readonly stableId: string | null;
  readonly issueScore: number;
  readonly ageHours: number;
  readonly summaryIsStale: boolean;
  readonly memberChangeRate: number;
  readonly priority: number;
}

interface ComputeInput {
  readonly issueScore: number;
  readonly ageHours: number;
  readonly summaryIsStale: boolean;
  readonly memberChangeRate: number;
}

export function computePriority(input: ComputeInput, cfg: QueueConfig = DEFAULT_QUEUE_CONFIG): number {
  const age = Math.max(0, input.ageHours);
  const freshness = Math.pow(0.5, age / cfg.freshnessHalfLifeHours);
  const unsummarized = input.summaryIsStale ? cfg.unsummarizedPenaltyMax : cfg.unsummarizedPenaltyMin;
  const novelty = input.memberChangeRate >= cfg.noveltyThreshold ? cfg.noveltyFactor : 1.0;
  return input.issueScore * freshness * unsummarized * novelty;
}

export function isStaleSummary(summary: string | null): boolean {
  if (summary === null || summary.length === 0) return true;
  return summary.startsWith('[fallback]');
}

// ── prev-tick snapshot for novelty detection ──
const prevTopByStableId = new Map<string, readonly number[]>();
const MAX_SNAPSHOT = 500;

export function recordSnapshot(stableId: string | null, topPostIds: readonly number[]): void {
  if (!stableId) return;
  if (prevTopByStableId.size >= MAX_SNAPSHOT && !prevTopByStableId.has(stableId)) {
    const firstKey = prevTopByStableId.keys().next().value as string | undefined;
    if (firstKey) prevTopByStableId.delete(firstKey);
  }
  prevTopByStableId.set(stableId, [...topPostIds]);
}

export function getPrevTopPostIds(stableId: string | null): readonly number[] {
  if (!stableId) return [];
  return prevTopByStableId.get(stableId) ?? [];
}

// Test-only — never call from runtime
export function _resetSnapshot(): void {
  prevTopByStableId.clear();
}

export function buildQueue(
  rows: readonly QueueBuildRow[],
  cfg: QueueConfig = DEFAULT_QUEUE_CONFIG,
  now: Date = new Date(),
): QueueItem[] {
  const items = rows.map((r): QueueItem => {
    const ageHours = (now.getTime() - r.calculatedAt.getTime()) / 3_600_000;
    const stale = isStaleSummary(r.summary);
    const prev = getPrevTopPostIds(r.stableId);
    // First-tick rows (no prev snapshot) get change=0 so they don't
    // inherit a spurious novelty boost from the empty-set Jaccard edge case.
    const change = prev.length === 0 ? 0 : memberChangeRate(prev, r.topPostIds);
    const priority = computePriority(
      { issueScore: r.issueScore, ageHours, summaryIsStale: stale, memberChangeRate: change },
      cfg,
    );
    return {
      rowId: r.rowId,
      stableId: r.stableId,
      issueScore: r.issueScore,
      ageHours,
      summaryIsStale: stale,
      memberChangeRate: change,
      priority,
    };
  });
  items.sort((a, b) => b.priority - a.priority);
  return items;
}

export async function loadQueueConfig(pool: Pool): Promise<QueueConfig> {
  const provider = new ScoringConfigProvider(pool);
  const group = await provider.getGroup('summary_queue');
  const num = (key: string, fallback: number): number => {
    const v = group[key];
    return typeof v === 'number' ? v : fallback;
  };
  return {
    freshnessHalfLifeHours: num('FRESHNESS_HALF_LIFE_HOURS', DEFAULT_QUEUE_CONFIG.freshnessHalfLifeHours),
    unsummarizedPenaltyMin: num('UNSUMMARIZED_PENALTY_MIN', DEFAULT_QUEUE_CONFIG.unsummarizedPenaltyMin),
    unsummarizedPenaltyMax: num('UNSUMMARIZED_PENALTY_MAX', DEFAULT_QUEUE_CONFIG.unsummarizedPenaltyMax),
    noveltyFactor: num('NOVELTY_FACTOR', DEFAULT_QUEUE_CONFIG.noveltyFactor),
    noveltyThreshold: num('NOVELTY_THRESHOLD', DEFAULT_QUEUE_CONFIG.noveltyThreshold),
    phaseTimeoutMs: num('PHASE_TIMEOUT_MS', DEFAULT_QUEUE_CONFIG.phaseTimeoutMs),
    singleCallTimeoutMs: num('SINGLE_CALL_TIMEOUT_MS', DEFAULT_QUEUE_CONFIG.singleCallTimeoutMs),
    maxIssuesPerWindow: num('MAX_ISSUES_PER_WINDOW', DEFAULT_QUEUE_CONFIG.maxIssuesPerWindow),
  };
}
