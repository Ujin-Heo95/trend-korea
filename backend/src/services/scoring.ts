import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { notifyPipelineWarning } from './discord.js';
import { calculateTrendSignalMap } from './trendSignals.js';
import {
  type Channel,
  type PreloadedWeights,
  SCORED_CATEGORIES_SQL,
  getChannel,
  getSourceWeight,
  getCategoryWeight,
  getCommunitySourceWeight,
  getCommunityHalfLife,
  volumeDampeningFactor,
  preloadWeights,
  getSourceWeightFrom,
  getCategoryWeightFrom,
  getCommunitySourceWeightFrom,
  getCommunityHalfLifeFrom,
  getHalfLifeFrom,
  getNewsHalfLifeFrom,
} from './scoring-weights.js';
import {
  type ScoreFactors,
  type VelocityData,
  type EngagementWeights,
  computeScore,
  normalizeEngagement,
  preloadEngagementWeights,
  calculateSourceStats,
  calculateChannelStats,
  calculateVelocityMap,
  calculateClusterBonusMap,
  calculateCategoryBaselines,
  calculateSubcategoryPercentiles,
  detectBreakingNews,
  calculatePortalRankMap,
  calculateClusterImportanceMap,
  calculateNewsEngagementMap,
  normalizeTrendSignal,
  freshnessBonus,
  velocityToBonus,
  communityVelocityToBonus,
} from './scoring-helpers.js';

// Re-export public API (preserves external import compatibility)
export { type Channel, getChannel, getSourceWeight, getCategoryWeight } from './scoring-weights.js';
export { getHalfLife, getNewsHalfLife, getCommunitySourceWeight, getCommunityHalfLife, volumeDampeningFactor } from './scoring-weights.js';
export { type ScoreFactors, computeScore, computeScoreLegacy } from './scoring-helpers.js';

const LN2 = Math.LN2;

// ─── Main Batch Calculator ───

let isScoring = false;
let scoringStartedAt = 0;
const SCORING_TIMEOUT_MS = 5 * 60_000; // 5분 타임아웃

/** Batch-calculate scores for all posts in the last 24 hours */
export async function calculateScores(pool: Pool): Promise<number> {
  if (isScoring) {
    const elapsed = Date.now() - scoringStartedAt;
    if (elapsed < SCORING_TIMEOUT_MS) {
      logger.warn({ elapsed: Math.round(elapsed / 1000) }, '[scoring] skipping — previous run still active');
      return 0;
    }
    const msg = `[scoring] stale lock force-released after ${Math.round(elapsed / 1000)}s`;
    logger.warn(msg);
    notifyPipelineWarning('scoring', msg).catch(() => {});
    isScoring = false;
  }
  isScoring = true;
  scoringStartedAt = Date.now();
  try { return await _calculateScores(pool); } finally { isScoring = false; }
}

async function _calculateScores(pool: Pool): Promise<number> {
  // Round 1: 독립적인 쿼리 8개를 한 번에 병렬 실행 (풀 max=15, 안전 범위)
  const [weights, engWeights, sourceStatsMap, channelStatsMap, velocityMap, clusterBonusMap, categoryBaselines, postsResult] = await Promise.all([
    preloadWeights().catch((): PreloadedWeights => ({
      sourceWeights: {}, defaultSourceWeight: 0.8,
      categoryWeights: {}, defaultCategoryWeight: 1.0,
      communitySourceWeights: {}, defaultCommunitySourceWeight: 1.0,
      communityDecayHalfLives: {}, defaultCommunityDecay: 150,
      channelHalfLives: {}, defaultHalfLife: 300,
      newsDecayHalfLives: {}, defaultNewsDecay: 240,
    })),
    preloadEngagementWeights().catch((): EngagementWeights => ({
      commentWeights: { community: 1.5, news: 0.5, video: 1.0, sns: 1.0, specialized: 1.0 },
      likeWeights: { community: 2.0, sns: 1.5, video: 1.2, specialized: 0.8, news: 0.3 },
    })),
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
        AND COALESCE(p.category, '') IN ${SCORED_CATEGORIES_SQL}
        AND p.title NOT LIKE '[사진]%'
    `),
  ]);

  const rows = postsResult.rows;
  if (rows.length === 0) return 0;

  // Round 2: trendSignalMap은 rows에 의존, 나머지는 독립적
  const [trendSignalMap, subcategoryPercentiles, breakingNewsMap, portalRankMap, clusterImportanceMap, newsEngagementMap] = await Promise.all([
    calculateTrendSignalMap(pool, rows.map(r => ({ id: r.id, title: r.title }))).catch(() => new Map<number, number>()),
    calculateSubcategoryPercentiles(pool).catch(() => new Map<number, number>()),
    detectBreakingNews(pool).catch(() => new Map<number, number>()),
    calculatePortalRankMap(pool).catch(() => new Map<number, number>()),
    calculateClusterImportanceMap(pool).catch(() => new Map<number, number>()),
    calculateNewsEngagementMap(pool).catch(() => new Map<number, number>()),
  ]);

  // 뉴스 signalScore 가중치 (DB 오버라이드 가능) — v6: 4항 가산 혼합
  const scoringConfig = (await import('./scoringConfig.js')).getScoringConfig();
  const newsPortalW = await scoringConfig.getNumber('news_signal_weights', 'portal_weight', 0.35).catch(() => 0.35);
  const newsClusterW = await scoringConfig.getNumber('news_signal_weights', 'cluster_weight', 0.30).catch(() => 0.30);
  const newsTrendW = await scoringConfig.getNumber('news_signal_weights', 'trend_weight', 0.20).catch(() => 0.20);
  const newsEngagementW = await scoringConfig.getNumber('news_signal_weights', 'engagement_weight', 0.15).catch(() => 0.15);

  const now = Date.now();
  const globalBaseline = 2.0;
  const rawScoreEntries: {
    postId: number; score: number; srcW: number; catW: number; sourceKey: string;
    velBonus: number; clusterBonus: number; trendBonus: number;
  }[] = [];

  for (const row of rows) {
    // 실제 게시 시점 기준 decay: published_at → first_scraped_at → scraped_at 순 폴백
    const postOrigin = row.published_at ?? row.first_scraped_at ?? row.scraped_at;
    const ageMinutes = Math.max((now - new Date(postOrigin).getTime()) / 60_000, 0);
    const channel = getChannel(row.category);
    const isCommunity = channel === 'community';
    const isNews = channel === 'news';
    const catBaseline = categoryBaselines.get(row.category ?? 'unknown') ?? globalBaseline;

    // Zero-engagement credibility 가중치
    let credibilityFactor = 0.8;
    if (row.view_count === 0 && row.comment_count === 0 && row.like_count === 0) {
      if (clusterBonusMap.has(row.id)) credibilityFactor = 1.15;
    }

    // 채널별 분기: 소스 가중치 (DB 설정 우선)
    const srcW = isCommunity
      ? getCommunitySourceWeightFrom(weights, row.source_key)
      : getSourceWeightFrom(weights, row.source_key);

    // 채널별 분기: decay 반감기 (DB 설정 우선)
    const halfLife = isCommunity
      ? getCommunityHalfLifeFrom(weights, row.source_key)
      : isNews
        ? getNewsHalfLifeFrom(weights, row.source_key)  // 뉴스: 소스별 차등 반감기
        : getHalfLifeFrom(weights, channel);

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
        : getCategoryWeightFrom(weights, row.category);

    // 뉴스 채널: 4항 가산 혼합 signalScore (v6)
    const newsSignalScore = isNews
      ? Math.max(
          (portalRankMap.get(row.id) ?? 0) * newsPortalW
          + (clusterImportanceMap.get(row.id) ?? 0) * newsClusterW
          + normalizeTrendSignal(trendSignalMap.get(row.id) ?? 1.0) * newsTrendW
          + (newsEngagementMap.get(row.id) ?? 0) * newsEngagementW,
          1.0,
        )
      : undefined;

    const factors: ScoreFactors = {
      normalizedEngagement: isNews
        ? newsSignalScore!               // 뉴스: signalScore가 engagement 자리를 대체
        : normalizeEngagement(
            row.view_count, row.comment_count, row.like_count,
            row.source_key, sourceStatsMap, channelStatsMap, channel,
            catBaseline * credibilityFactor, engWeights,
          ),
      decay: Math.exp(-LN2 * ageMinutes / halfLife),
      sourceWeight: srcW,
      categoryWeight: catW,
      velocityBonus: isNews ? 1.0 : velBonus,           // 뉴스: velocity 무의미 (데이터 없음)
      clusterBonus: isNews ? 1.0 : (clusterBonusMap.get(row.id) ?? 1.0),  // 뉴스: signalScore에 통합
      trendSignalBonus: isNews ? 1.0 : (trendSignalMap.get(row.id) ?? 1.0), // 뉴스: signalScore에 통합
      subcategoryNorm: 1.0,    // 이미 catW에 반영됨 (뉴스용)
      breakingBoost: isNews ? (breakingNewsMap.get(row.id) ?? 1.0) : 1.0,
      freshnessBonus: isNews ? freshnessBonus(ageMinutes) : 1.0,
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

    // 뉴스 signalScore 분포 로깅 (v6: 4항)
    const portalHits = rawScoreEntries.filter(e => portalRankMap.has(e.postId)).length;
    const clusterHits = rawScoreEntries.filter(e => clusterImportanceMap.has(e.postId)).length;
    const engagementHits = rawScoreEntries.filter(e => newsEngagementMap.has(e.postId)).length;
    const breakingHits = rawScoreEntries.filter(e => breakingNewsMap.has(e.postId)).length;
    if (portalHits + clusterHits + engagementHits + breakingHits > 0) {
      console.log(
        `[scoring:news] signalScore active: portal=${portalHits} cluster=${clusterHits} engagement=${engagementHits} breaking=${breakingHits}`
      );
    }
  }

  return updated;
}
