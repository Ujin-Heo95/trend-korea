import type { Pool } from 'pg';
import pLimit from 'p-limit';
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
  sourceHasLikeData,
  preloadEngagementWeights,
  calculateSourceStats,
  calculateChannelStats,
  calculateVelocityMap,
  calculateClusterBonusMap,
  calculateCategoryBaselines,
  calculateSubcategoryPercentiles,
  detectBreakingNews,
  calculatePortalRankMap,
  calculateClusterImportanceMapV7,
  calculateNewsEngagementMap,
  normalizeTrendSignal,
  freshnessSignal,
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
  try {
    return await Promise.race([
      _calculateScores(pool),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('[scoring] pipeline timeout after 4min')), 4 * 60_000),
      ),
    ]);
  } finally { isScoring = false; }
}

async function _calculateScores(pool: Pool): Promise<number> {
  // p-limit(4): batchPool(max=9) 동시 점유를 4개로 제한 → API healthcheck용 여유 확보.
  // 이전: Round 1(8) + Round 2(6) = 순간 14개 파이어, batchPool/apiPool 공유 시 API 죽음.
  const limit = pLimit(4);
  const run = <T>(fn: () => Promise<T>) => limit(fn);

  // Round 1: 독립적인 쿼리 8개를 p-limit(4)로 제한 병렬 실행
  const [weights, engWeights, sourceStatsMap, channelStatsMap, velocityMap, clusterBonusMap, categoryBaselines, postsResult] = await Promise.all([
    run(() => preloadWeights().catch((): PreloadedWeights => ({
      sourceWeights: {}, defaultSourceWeight: 0.8,
      categoryWeights: {}, defaultCategoryWeight: 1.0,
      communitySourceWeights: {}, defaultCommunitySourceWeight: 1.0,
      communityDecayHalfLives: {}, defaultCommunityDecay: 150,
      channelHalfLives: {}, defaultHalfLife: 300,
      newsDecayHalfLives: {}, defaultNewsDecay: 240,
    }))),
    run(() => preloadEngagementWeights().catch((): EngagementWeights => ({
      commentWeights: { community: 1.5, news: 0.5, video: 1.0, sns: 1.0, specialized: 1.0 },
      likeWeights: { community: 2.0, sns: 1.5, video: 1.2, specialized: 0.8, news: 0.3 },
    }))),
    run(() => calculateSourceStats(pool)),
    run(() => calculateChannelStats(pool)),
    run(() => calculateVelocityMap(pool).catch(() => new Map<number, VelocityData>())),
    run(() => calculateClusterBonusMap(pool).catch(() => new Map<number, number>())),
    run(() => calculateCategoryBaselines(pool)),
    run(() => pool.query<{
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
    `)),
  ]);

  const rows = postsResult.rows;
  if (rows.length === 0) return 0;

  // Round 2: trendSignalMap은 rows에 의존, 나머지는 독립적 (Round 1과 동일한 limit 공유)
  const [trendSignalMap, subcategoryPercentiles, breakingNewsMap, portalRankMap, clusterImportanceMap, newsEngagementMap] = await Promise.all([
    run(() => calculateTrendSignalMap(pool, rows.map(r => ({ id: r.id, title: r.title }))).catch(() => new Map<number, number>())),
    run(() => calculateSubcategoryPercentiles(pool).catch(() => new Map<number, number>())),
    run(() => detectBreakingNews(pool).catch(() => new Map<number, number>())),
    run(() => calculatePortalRankMap(pool).catch(() => new Map<number, number>())),
    run(() => calculateClusterImportanceMapV7(pool).catch(() => new Map<number, number>())),
    run(() => calculateNewsEngagementMap(pool).catch(() => new Map<number, number>())),
  ]);

  // 뉴스 signalScore 가중치 (DB 오버라이드 가능) — v7: 5항 가산 혼합 (freshness 흡수)
  const scoringConfig = (await import('./scoringConfig.js')).getScoringConfig();
  const newsPortalW = await scoringConfig.getNumber('news_signal_weights_v7', 'portal_weight', 0.32).catch(() => 0.32);
  const newsClusterW = await scoringConfig.getNumber('news_signal_weights_v7', 'cluster_weight', 0.27).catch(() => 0.27);
  const newsTrendW = await scoringConfig.getNumber('news_signal_weights_v7', 'trend_weight', 0.18).catch(() => 0.18);
  const newsEngagementW = await scoringConfig.getNumber('news_signal_weights_v7', 'engagement_weight', 0.13).catch(() => 0.13);
  const newsFreshnessW = await scoringConfig.getNumber('news_signal_weights_v7', 'freshness_weight', 0.10).catch(() => 0.10);

  const now = Date.now();
  const globalBaseline = 2.0;
  const rawScoreEntries: {
    postId: number; score: number; srcW: number; catW: number; sourceKey: string;
    velBonus: number; clusterBonus: number; trendBonus: number;
    // Track B 증분 decay 를 위한 메타 (057 스키마 / PR #2)
    decayFactor: number; postOrigin: Date; halfLifeMin: number;
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

    // 채널별 분기: velocity 보너스 (커뮤니티: 좋아요 미수집 소스 보정)
    const velBonus = isCommunity
      ? communityVelocityToBonus(velocityMap.get(row.id), sourceHasLikeData(sourceStatsMap, row.source_key))
      : velocityToBonus(velocityMap.get(row.id));

    // 뉴스: subcategoryNorm 대체 categoryWeight / 커뮤니티: categoryWeight 제거 (1.0)
    const pctRank = subcategoryPercentiles.get(row.id);
    const catW = isNews && pctRank !== undefined
      ? 0.8 + 0.6 * pctRank                // subcategoryNorm [0.8, 1.4]
      : isCommunity
        ? 1.0                               // 커뮤니티는 categoryWeight 불필요
        : getCategoryWeightFrom(weights, row.category);

    // 뉴스 채널 v7: 5항 가산 혼합 signalScore — freshness를 5번째 가산항으로 흡수.
    // v6 외곽 freshnessBonus 곱셈(1.3/1.15/1.075/1.0) 제거 → halfLife decay와의 이중 계산 해소.
    const newsSignalScore = isNews
      ? Math.max(
          (portalRankMap.get(row.id) ?? 0) * newsPortalW
          + (clusterImportanceMap.get(row.id) ?? 0) * newsClusterW
          + normalizeTrendSignal(trendSignalMap.get(row.id) ?? 1.0) * newsTrendW
          + (newsEngagementMap.get(row.id) ?? 0) * newsEngagementW
          + freshnessSignal(ageMinutes) * newsFreshnessW,
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
      // v7: 커뮤니티 탭에서도 clusterBonus/trendSignalBonus 제거 — 같은 주제 반복 게시글 과대보상 방지.
      // 뉴스는 signalScore에 통합, 그 외(specialized 등)는 기존 유지.
      clusterBonus: isNews || isCommunity ? 1.0 : (clusterBonusMap.get(row.id) ?? 1.0),
      trendSignalBonus: isNews || isCommunity ? 1.0 : (trendSignalMap.get(row.id) ?? 1.0),
      subcategoryNorm: 1.0,    // 이미 catW에 반영됨 (뉴스용)
      breakingBoost: isNews ? (breakingNewsMap.get(row.id) ?? 1.0) : 1.0,
    };

    const score = computeScore(factors);
    rawScoreEntries.push({
      postId: row.id, score, srcW, catW, sourceKey: row.source_key,
      velBonus: factors.velocityBonus, clusterBonus: factors.clusterBonus,
      trendBonus: factors.trendSignalBonus,
      decayFactor: factors.decay,
      postOrigin: new Date(postOrigin),
      halfLifeMin: halfLife,
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
  // 057 스키마: trend_score_base (=score / decayFactor), post_origin, half_life_min 도 함께 기록 →
  //           Track B decay-updater(PR #2)가 이 행들을 주기적으로 재감쇠할 수 있도록 한다.
  // CHUNK 100 + 50ms yield: post_scores 락 보유 시간을 평균 ≤2초로 줄여 ALTER TABLE
  // (마이그레이션 057/058 등 ACCESS EXCLUSIVE 락)이 lock_timeout 안에 끼어들 수 있게 한다.
  const CHUNK = 100;
  let updated = 0;
  for (let start = 0; start < rawScoreEntries.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, rawScoreEntries.length);
    const chunkParams: unknown[] = [];
    const chunkValues: string[] = [];
    for (let j = start; j < end; j++) {
      const entry = rawScoreEntries[j];
      // decayFactor ≈ 0 이면 base 발산 방지 — 24h 이상 노후행은 어차피 Track B 윈도 밖.
      const base = entry.decayFactor > 1e-6 ? entry.score / entry.decayFactor : entry.score;
      const i = chunkParams.length;
      chunkParams.push(
        entry.postId, entry.score, entry.srcW, entry.catW,
        entry.velBonus, entry.clusterBonus, entry.trendBonus,
        base, entry.postOrigin, entry.halfLifeMin,
      );
      chunkValues.push(
        `($${i+1},$${i+2},$${i+3},$${i+4},NOW(),$${i+5},$${i+6},$${i+7},$${i+8},$${i+9},$${i+10},NOW())`
      );
    }
    const result = await pool.query(
      `INSERT INTO post_scores (
         post_id, trend_score, source_weight, category_weight, calculated_at,
         velocity_bonus, cluster_bonus, trend_signal_bonus,
         trend_score_base, post_origin, half_life_min, decayed_at
       )
       VALUES ${chunkValues.join(',')}
       ON CONFLICT (post_id) DO UPDATE SET
         trend_score = EXCLUDED.trend_score,
         source_weight = EXCLUDED.source_weight,
         category_weight = EXCLUDED.category_weight,
         calculated_at = EXCLUDED.calculated_at,
         velocity_bonus = EXCLUDED.velocity_bonus,
         cluster_bonus = EXCLUDED.cluster_bonus,
         trend_signal_bonus = EXCLUDED.trend_signal_bonus,
         trend_score_base = EXCLUDED.trend_score_base,
         post_origin = EXCLUDED.post_origin,
         half_life_min = EXCLUDED.half_life_min,
         decayed_at = EXCLUDED.decayed_at`,
      chunkParams
    );
    updated += result.rowCount ?? 0;
    if (end < rawScoreEntries.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
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
