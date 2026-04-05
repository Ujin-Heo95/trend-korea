import type { Pool } from 'pg';
import { calculateTrendSignalMap } from './trendSignals.js';
import {
  type Channel,
  CHANNEL_HALF_LIFE_MINUTES,
  DEFAULT_HALF_LIFE_MINUTES,
  getChannel,
  getSourceWeight,
  getCategoryWeight,
  getCommunitySourceWeight,
  getCommunityHalfLife,
  volumeDampeningFactor,
} from './scoring-weights.js';
import {
  type ScoreFactors,
  type VelocityData,
  computeScore,
  normalizeEngagement,
  calculateSourceStats,
  calculateChannelStats,
  calculateVelocityMap,
  calculateClusterBonusMap,
  calculateCategoryBaselines,
  calculateSubcategoryPercentiles,
  detectBreakingNews,
  velocityToBonus,
  communityVelocityToBonus,
} from './scoring-helpers.js';

// Re-export public API (preserves external import compatibility)
export { type Channel, getChannel, getSourceWeight, getCategoryWeight } from './scoring-weights.js';
export { getHalfLife, getCommunitySourceWeight, getCommunityHalfLife, volumeDampeningFactor } from './scoring-weights.js';
export { type ScoreFactors, computeScore, computeScoreLegacy } from './scoring-helpers.js';

const LN2 = Math.LN2;

// ─── Main Batch Calculator ───

let isScoring = false;

/** Batch-calculate scores for all posts in the last 24 hours */
export async function calculateScores(pool: Pool): Promise<number> {
  if (isScoring) {
    console.warn('[scoring] skipping — previous run still active');
    return 0;
  }
  isScoring = true;
  try { return await _calculateScores(pool); } finally { isScoring = false; }
}

async function _calculateScores(pool: Pool): Promise<number> {
  // Step 1: 서브 계산 병렬 실행
  const [
    sourceStatsMap,
    channelStatsMap,
    velocityMap,
    clusterBonusMap,
    categoryBaselines,
    postsResult,
  ] = await Promise.all([
    calculateSourceStats(pool),
    calculateChannelStats(pool),
    calculateVelocityMap(pool).catch(() => new Map<number, VelocityData>()),
    calculateClusterBonusMap(pool).catch(() => new Map<number, number>()),
    calculateCategoryBaselines(pool),
    pool.query<{
      id: number;
      source_key: string;
      category: string | null;
      title: string;
      view_count: number;
      comment_count: number;
      like_count: number;
      published_at: Date | null;
      first_scraped_at: Date;
      scraped_at: Date;
    }>(`
      SELECT p.id, p.source_key, p.category, p.title, p.view_count, p.comment_count, p.like_count,
             p.published_at, p.first_scraped_at, p.scraped_at
      FROM posts p
      WHERE p.scraped_at > NOW() - INTERVAL '24 hours'
        AND COALESCE(p.category, '') IN ('news', 'press', 'community')
    `),
  ]);

  const rows = postsResult.rows;
  if (rows.length === 0) return 0;

  // Step 1.5: 채널별 추가 계산 (트렌드 신호, 서브카테고리, 속보)
  const [trendSignalMap, subcategoryPercentiles, breakingNewsMap] = await Promise.all([
    calculateTrendSignalMap(pool, rows.map(r => ({ id: r.id, title: r.title }))).catch(() => new Map<number, number>()),
    calculateSubcategoryPercentiles(pool).catch(() => new Map<number, number>()),
    detectBreakingNews(pool).catch(() => new Map<number, number>()),
  ]);

  const now = Date.now();
  const globalBaseline = 2.0;
  const rawScoreEntries: {
    postId: number; score: number; srcW: number; catW: number; sourceKey: string;
    velBonus: number; clusterBonus: number; trendBonus: number;
  }[] = [];

  for (const row of rows) {
    // 실제 게시 시점 기준 decay: published_at → first_scraped_at → scraped_at 순 폴백
    const postOrigin = row.published_at ?? row.first_scraped_at ?? row.scraped_at;
    const ageMinutes = (now - new Date(postOrigin).getTime()) / 60_000;
    const channel = getChannel(row.category);
    const isCommunity = channel === 'community';
    const isNews = channel === 'news';
    const catBaseline = categoryBaselines.get(row.category ?? 'unknown') ?? globalBaseline;

    // Zero-engagement credibility 가중치
    let credibilityFactor = 0.8;
    if (row.view_count === 0 && row.comment_count === 0 && row.like_count === 0) {
      if (clusterBonusMap.has(row.id)) credibilityFactor = 1.15;
    }

    // 채널별 분기: 소스 가중치
    const srcW = isCommunity
      ? getCommunitySourceWeight(row.source_key)
      : getSourceWeight(row.source_key);

    // 채널별 분기: decay 반감기
    const halfLife = isCommunity
      ? getCommunityHalfLife(row.source_key)
      : (CHANNEL_HALF_LIFE_MINUTES[channel] ?? DEFAULT_HALF_LIFE_MINUTES);

    // 채널별 분기: velocity 보너스
    const velBonus = isCommunity
      ? communityVelocityToBonus(velocityMap.get(row.id))
      : velocityToBonus(velocityMap.get(row.id));

    // 뉴스: subcategoryNorm 대체 categoryWeight / 커뮤니티: categoryWeight 제거 (1.0)
    const pctRank = subcategoryPercentiles.get(row.id);
    const catW = isNews && pctRank !== undefined
      ? 0.8 + 0.6 * pctRank                // subcategoryNorm [0.8, 1.4]
      : isCommunity
        ? 1.0                               // 커뮤니티는 categoryWeight 불필요
        : getCategoryWeight(row.category);

    const factors: ScoreFactors = {
      normalizedEngagement: normalizeEngagement(
        row.view_count, row.comment_count, row.like_count,
        row.source_key, sourceStatsMap, channelStatsMap, channel,
        catBaseline * credibilityFactor,
      ),
      decay: Math.exp(-LN2 * ageMinutes / halfLife),
      sourceWeight: srcW,
      categoryWeight: catW,
      velocityBonus: velBonus,
      clusterBonus: clusterBonusMap.get(row.id) ?? 1.0,
      trendSignalBonus: trendSignalMap.get(row.id) ?? 1.0,
      subcategoryNorm: 1.0,    // 이미 catW에 반영됨 (뉴스용)
      breakingBoost: isNews ? (breakingNewsMap.get(row.id) ?? 1.0) : 1.0,
    };

    const score = computeScore(factors);
    rawScoreEntries.push({
      postId: row.id, score, srcW, catW, sourceKey: row.source_key,
      velBonus: factors.velocityBonus, clusterBonus: factors.clusterBonus,
      trendBonus: factors.trendSignalBonus,
    });
  }

  // Step 2.5: 소스 볼륨 감쇄 (과대표현 억제)
  const sourcePostCounts = new Map<string, number>();
  for (const entry of rawScoreEntries) {
    sourcePostCounts.set(entry.sourceKey, (sourcePostCounts.get(entry.sourceKey) ?? 0) + 1);
  }
  const countValues = [...sourcePostCounts.values()].sort((a, b) => a - b);
  const medianCount = countValues[Math.floor(countValues.length / 2)] || 1;
  for (const entry of rawScoreEntries) {
    const srcCount = sourcePostCounts.get(entry.sourceKey) ?? 1;
    entry.score *= volumeDampeningFactor(srcCount, medianCount);
  }

  // Step 3: Batch UPSERT in chunks of 500 (raw score 직접 사용)
  const COLS_PER_ROW = 7;
  const CHUNK = 500;
  let updated = 0;
  for (let start = 0; start < rawScoreEntries.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, rawScoreEntries.length);
    const chunkParams: unknown[] = [];
    const chunkValues: string[] = [];
    for (let j = start; j < end; j++) {
      const entry = rawScoreEntries[j];
      const i = chunkParams.length;
      chunkParams.push(entry.postId, entry.score, entry.srcW, entry.catW, entry.velBonus, entry.clusterBonus, entry.trendBonus);
      chunkValues.push(`($${i+1},$${i+2},$${i+3},$${i+4},NOW(),$${i+5},$${i+6},$${i+7})`);
    }
    const result = await pool.query(
      `INSERT INTO post_scores (post_id, trend_score, source_weight, category_weight, calculated_at, velocity_bonus, cluster_bonus, trend_signal_bonus)
       VALUES ${chunkValues.join(',')}
       ON CONFLICT (post_id) DO UPDATE SET
         trend_score = EXCLUDED.trend_score,
         source_weight = EXCLUDED.source_weight,
         category_weight = EXCLUDED.category_weight,
         calculated_at = EXCLUDED.calculated_at,
         velocity_bonus = EXCLUDED.velocity_bonus,
         cluster_bonus = EXCLUDED.cluster_bonus,
         trend_signal_bonus = EXCLUDED.trend_signal_bonus`,
      chunkParams
    );
    updated += result.rowCount ?? 0;
  }

  // 스코어 분포 로깅 (raw score)
  if (rawScoreEntries.length > 0) {
    const finalScores = rawScoreEntries.map(e => e.score).sort((a, b) => a - b);
    const p = (pct: number) => finalScores[Math.floor(finalScores.length * pct / 100)]?.toFixed(2) ?? '?';
    const top3 = rawScoreEntries
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(e => `[id=${e.postId} score=${e.score.toFixed(2)} src=${e.sourceKey}]`)
      .join(' ');
    console.log(
      `[scoring] ${finalScores.length} posts scored (raw). p25=${p(25)} p50=${p(50)} p75=${p(75)} p90=${p(90)} max=${p(100)} | top3: ${top3}`
    );
  }

  return updated;
}
