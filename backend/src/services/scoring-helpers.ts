import type { Pool } from 'pg';
import type { Channel } from './scoring-weights.js';
import { CHANNEL_HALF_LIFE_MINUTES, DEFAULT_HALF_LIFE_MINUTES } from './scoring-weights.js';
import { getEmbedding, cosineSimVectors } from './embedding.js';

const LN2 = Math.LN2;

// ─── Stats Cache (1-hour TTL) ───

const STATS_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

interface StatsCache<K, V> {
  data: Map<K, V>;
  fetchedAt: number;
}

let sourceStatsCache: StatsCache<string, SourceStats> | null = null;
let channelStatsCache: StatsCache<Channel, SourceStats> | null = null;

/** 테스트용: 캐시 초기화 */
export function clearStatsCache(): void {
  sourceStatsCache = null;
  channelStatsCache = null;
}

// ─── Score Component Types ───

export interface ScoreFactors {
  normalizedEngagement: number;
  decay: number;
  sourceWeight: number;
  categoryWeight: number;
  velocityBonus: number;
  clusterBonus: number;
  trendSignalBonus: number;
  subcategoryNorm: number;
  breakingBoost: number;
}

export interface SourceStats {
  meanLogViews: number;
  stddevLogViews: number;
  meanLogComments: number;
  stddevLogComments: number;
  meanLogLikes: number;
  stddevLogLikes: number;
  sampleCount: number;
}

export interface VelocityData {
  viewVelocity: number;
  commentVelocity: number;
  likeVelocity: number;
}

// ─── Core Scoring Formula ───

export function computeScore(factors: ScoreFactors): number {
  return factors.normalizedEngagement
    * factors.decay
    * factors.sourceWeight
    * factors.categoryWeight
    * factors.velocityBonus
    * factors.clusterBonus
    * factors.trendSignalBonus
    * factors.subcategoryNorm
    * factors.breakingBoost;
}

/** Backward-compatible overload for tests / simple usage */
export function computeScoreLegacy(
  viewCount: number,
  commentCount: number,
  ageMinutes: number,
  sourceWeight: number,
  categoryWeight: number,
  clusterBonus: number = 1.0,
  channel: Channel = 'specialized',
): number {
  const rawEngagement = Math.log1p(viewCount) + Math.log1p(commentCount) * 1.5;
  const engagement = rawEngagement > 0 ? rawEngagement : 2.0;
  const halfLife = CHANNEL_HALF_LIFE_MINUTES[channel] ?? DEFAULT_HALF_LIFE_MINUTES;
  const decay = Math.exp(-LN2 * ageMinutes / halfLife);
  return engagement * decay * sourceWeight * categoryWeight * clusterBonus;
}

// ─── Community Velocity (댓글·좋아요 가중 강화) ───

export function communityVelocityToBonus(velocity: VelocityData | undefined, hasLikeData: boolean = true): number {
  if (!velocity) return 1.0;
  let score: number;
  if (hasLikeData) {
    score = Math.log1p(velocity.viewVelocity)
      + Math.log1p(velocity.commentVelocity) * 3.0
      + Math.log1p(velocity.likeVelocity) * 3.0;
  } else {
    // 좋아요 미수집: view(1)+comment(3) 예산을 7.0 총합으로 비례 확대 (scale=7/4=1.75)
    const scale = 1.75;
    score = Math.log1p(velocity.viewVelocity) * scale
      + Math.log1p(velocity.commentVelocity) * 3.0 * scale;
  }
  return 1.0 + Math.min(score / 8.0, 0.6); // [1.0, 1.6]
}

// ─── News: Subcategory Percentile Normalization ───

export async function calculateSubcategoryPercentiles(pool: Pool): Promise<Map<number, number>> {
  const { rows } = await pool.query<{ id: number; pct_rank: number }>(`
    SELECT p.id,
      PERCENT_RANK() OVER (
        PARTITION BY COALESCE(p.subcategory, '기타')
        ORDER BY COALESCE(ps.trend_score, 0)
      )::float AS pct_rank
    FROM posts p
    LEFT JOIN post_scores ps ON ps.post_id = p.id
    WHERE p.category = 'news'
      AND p.scraped_at > NOW() - INTERVAL '24 hours'
  `);
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.id, r.pct_rank);
  return map;
}

// ─── News: Breaking News Detection ───

/** T1 통신사 소스 (단독 속보 감지 대상) */
const T1_BREAKING_SOURCES = new Set(['yna', 'newsis', 'ytn']);
/** 속보 키워드 패턴 */
const BREAKING_TITLE_RE = /속보|긴급|flash|breaking/i;

export async function detectBreakingNews(pool: Pool): Promise<Map<number, number>> {
  // 경로 1: 기존 다중 소스 속보 감지 (3개+ 소스, 30분 이내)
  const { rows } = await pool.query<{
    canonical_post_id: number;
    first_at: Date;
  }>(`
    SELECT pc.canonical_post_id,
           MIN(p.scraped_at) AS first_at
    FROM post_clusters pc
    JOIN post_cluster_members pcm ON pcm.cluster_id = pc.id
    JOIN posts p ON p.id = pcm.post_id
    WHERE pc.cluster_created_at > NOW() - INTERVAL '2 hours'
      AND p.category = 'news'
    GROUP BY pc.canonical_post_id
    HAVING COUNT(DISTINCT p.source_key) >= 3
      AND MAX(p.scraped_at) - MIN(p.scraped_at) < INTERVAL '30 minutes'
  `);

  const map = new Map<number, number>();
  const now = Date.now();
  for (const r of rows) {
    const minutesAge = (now - new Date(r.first_at).getTime()) / 60_000;
    // 30분 반감기: 감지 시점 3.0 → 30분 후 2.0 → 120분 ~1.0
    const boost = 1.0 + 2.0 * Math.exp(-LN2 * minutesAge / 30);
    map.set(r.canonical_post_id, Math.min(boost, 3.0));
  }

  // 경로 2: T1 통신사 단독 속보 (제목에 "속보/긴급" 포함)
  const { rows: t1Rows } = await pool.query<{
    id: number;
    source_key: string;
    title: string;
    scraped_at: Date;
  }>(`
    SELECT p.id, p.source_key, p.title, p.scraped_at
    FROM posts p
    WHERE p.source_key = ANY($1)
      AND p.scraped_at > NOW() - INTERVAL '2 hours'
      AND p.category IN ('news', 'portal')
  `, [[...T1_BREAKING_SOURCES]]);

  for (const r of t1Rows) {
    if (!BREAKING_TITLE_RE.test(r.title)) continue;
    // 이미 다중 소스 속보로 더 높은 부스트를 받고 있으면 스킵
    if ((map.get(r.id) ?? 0) >= 2.0) continue;

    const minutesAge = (now - new Date(r.scraped_at).getTime()) / 60_000;
    // 보수적 부스트: 최대 2.0 (다중 소스 3.0보다 낮음)
    const boost = 1.0 + 1.0 * Math.exp(-LN2 * minutesAge / 30);
    const existing = map.get(r.id) ?? 0;
    map.set(r.id, Math.max(existing, Math.min(boost, 2.0)));
  }

  return map;
}

// ─── Sub-calculations ───

/** 소스별 Z-Score 정규화용 통계 계산 + DB 캐싱 (1시간 인메모리 캐시) */
export async function calculateSourceStats(pool: Pool): Promise<Map<string, SourceStats>> {
  const now = Date.now();
  if (sourceStatsCache && (now - sourceStatsCache.fetchedAt) < STATS_CACHE_TTL_MS) {
    return sourceStatsCache.data;
  }

  const { rows } = await pool.query<{
    source_key: string;
    mean_log_views: number;
    stddev_log_views: number;
    mean_log_comments: number;
    stddev_log_comments: number;
    mean_log_likes: number;
    stddev_log_likes: number;
    sample_count: number;
  }>(`
    SELECT source_key,
      AVG(ln(1 + view_count))::float AS mean_log_views,
      GREATEST(STDDEV(ln(1 + view_count)), 0.1)::float AS stddev_log_views,
      AVG(ln(1 + comment_count))::float AS mean_log_comments,
      GREATEST(STDDEV(ln(1 + comment_count)), 0.1)::float AS stddev_log_comments,
      AVG(ln(1 + like_count))::float AS mean_log_likes,
      GREATEST(STDDEV(ln(1 + like_count)), 0.1)::float AS stddev_log_likes,
      COUNT(*)::int AS sample_count
    FROM posts
    WHERE scraped_at > NOW() - INTERVAL '7 days' AND view_count > 0
    GROUP BY source_key
  `);

  const map = new Map<string, SourceStats>();
  for (const r of rows) {
    map.set(r.source_key, {
      meanLogViews: r.mean_log_views,
      stddevLogViews: r.stddev_log_views,
      meanLogComments: r.mean_log_comments,
      stddevLogComments: r.stddev_log_comments,
      meanLogLikes: r.mean_log_likes,
      stddevLogLikes: r.stddev_log_likes,
      sampleCount: r.sample_count,
    });
  }

  // DB에 캐싱 (source_engagement_stats)
  if (rows.length > 0) {
    const values: string[] = [];
    const params: unknown[] = [];
    for (const r of rows) {
      const i = params.length;
      values.push(`($${i+1},$${i+2},$${i+3},$${i+4},$${i+5},$${i+6},$${i+7},$${i+8})`);
      params.push(r.source_key, r.mean_log_views, r.stddev_log_views,
                  r.mean_log_comments, r.stddev_log_comments,
                  r.mean_log_likes, r.stddev_log_likes, r.sample_count);
    }
    await pool.query(
      `INSERT INTO source_engagement_stats (source_key, mean_log_views, stddev_log_views, mean_log_comments, stddev_log_comments, mean_log_likes, stddev_log_likes, sample_count)
       VALUES ${values.join(',')}
       ON CONFLICT (source_key) DO UPDATE SET
         mean_log_views = EXCLUDED.mean_log_views,
         stddev_log_views = EXCLUDED.stddev_log_views,
         mean_log_comments = EXCLUDED.mean_log_comments,
         stddev_log_comments = EXCLUDED.stddev_log_comments,
         mean_log_likes = EXCLUDED.mean_log_likes,
         stddev_log_likes = EXCLUDED.stddev_log_likes,
         sample_count = EXCLUDED.sample_count,
         calculated_at = NOW()`,
      params
    );
  }

  sourceStatsCache = { data: map, fetchedAt: Date.now() };
  return map;
}

/** 채널별 통계 계산 (소스 샘플 부족 시 fallback, 1시간 인메모리 캐시) */
export async function calculateChannelStats(pool: Pool): Promise<Map<Channel, SourceStats>> {
  const now = Date.now();
  if (channelStatsCache && (now - channelStatsCache.fetchedAt) < STATS_CACHE_TTL_MS) {
    return channelStatsCache.data;
  }
  const { rows } = await pool.query<{
    channel: string;
    mean_log_views: number;
    stddev_log_views: number;
    mean_log_comments: number;
    stddev_log_comments: number;
    mean_log_likes: number;
    stddev_log_likes: number;
    sample_count: number;
  }>(`
    SELECT
      CASE
        WHEN category IN ('community','blog') THEN 'community'
        WHEN category IN ('news','newsletter','government','portal') THEN 'news'
        WHEN category = 'video' THEN 'video'
        WHEN category = 'sns' THEN 'sns'
        ELSE 'specialized'
      END AS channel,
      AVG(ln(1 + view_count))::float AS mean_log_views,
      GREATEST(STDDEV(ln(1 + view_count)), 0.1)::float AS stddev_log_views,
      AVG(ln(1 + comment_count))::float AS mean_log_comments,
      GREATEST(STDDEV(ln(1 + comment_count)), 0.1)::float AS stddev_log_comments,
      AVG(ln(1 + like_count))::float AS mean_log_likes,
      GREATEST(STDDEV(ln(1 + like_count)), 0.1)::float AS stddev_log_likes,
      COUNT(*)::int AS sample_count
    FROM posts
    WHERE scraped_at > NOW() - INTERVAL '7 days' AND view_count > 0
    GROUP BY channel
  `);

  const map = new Map<Channel, SourceStats>();
  for (const r of rows) {
    map.set(r.channel as Channel, {
      meanLogViews: r.mean_log_views,
      stddevLogViews: r.stddev_log_views,
      meanLogComments: r.mean_log_comments,
      stddevLogComments: r.stddev_log_comments,
      meanLogLikes: r.mean_log_likes,
      stddevLogLikes: r.stddev_log_likes,
      sampleCount: r.sample_count,
    });
  }
  channelStatsCache = { data: map, fetchedAt: Date.now() };
  return map;
}

/** 채널별 댓글 가중치 (코드 기본값 — DB 설정으로 오버라이드 가능) */
const CHANNEL_COMMENT_WEIGHT: Record<Channel, number> = {
  community: 1.5,    // 커뮤니티 댓글은 참여 지표로 중요
  news: 0.5,         // 뉴스 댓글은 덜 의미 있음
  video: 1.0,        // 영상 댓글은 보통
  sns: 1.0,          // SNS 댓글은 보통
  specialized: 1.0,  // 테크블로그 등
};

/** 채널별 좋아요 가중치 (코드 기본값 — DB 설정으로 오버라이드 가능) */
const CHANNEL_LIKE_WEIGHT: Record<Channel, number> = {
  community: 2.0,    // 커뮤니티 추천은 가장 강한 품질 지표
  sns: 1.5,          // SNS 좋아요는 높은 참여
  video: 1.2,        // 영상 좋아요는 적당
  specialized: 0.8,  // 전문 사이트는 보통
  news: 0.3,         // 뉴스 좋아요는 약한 신호 (대부분 없음)
};

export interface EngagementWeights {
  readonly commentWeights: Record<string, number>;
  readonly likeWeights: Record<string, number>;
}

import { getScoringConfig } from './scoringConfig.js';

/** 배치 시작 시 참여도 가중치를 한 번만 로드 */
export async function preloadEngagementWeights(): Promise<EngagementWeights> {
  const config = getScoringConfig();
  const [commentWeights, likeWeights] = await Promise.all([
    config.getRecord('engagement_weights', 'comment_weights'),
    config.getRecord('engagement_weights', 'like_weights'),
  ]);
  return {
    commentWeights: Object.keys(commentWeights).length > 0 ? commentWeights : { ...CHANNEL_COMMENT_WEIGHT },
    likeWeights: Object.keys(likeWeights).length > 0 ? likeWeights : { ...CHANNEL_LIKE_WEIGHT },
  };
}

/** 소스가 좋아요 데이터를 실질적으로 수집하는지 판별 (meanLogLikes ≈ 0 && 분산 없음 → 미수집) */
export function sourceHasLikeData(sourceStatsMap: Map<string, SourceStats>, sourceKey: string): boolean {
  const stats = sourceStatsMap.get(sourceKey);
  if (!stats) return true; // 통계 없으면 기본적으로 있다고 가정
  return stats.meanLogLikes >= 0.1 || stats.stddevLogLikes > 0.1;
}

/** Z-Score 정규화된 engagement 계산 (채널 인식, 메트릭 완전성 보정) */
export function normalizeEngagement(
  viewCount: number,
  commentCount: number,
  likeCount: number,
  sourceKey: string,
  sourceStatsMap: Map<string, SourceStats>,
  channelStatsMap: Map<Channel, SourceStats>,
  channel: Channel,
  categoryBaseline: number,
  engagementWeights?: EngagementWeights,
): number {
  const commentWeight = engagementWeights?.commentWeights[channel] ?? CHANNEL_COMMENT_WEIGHT[channel];
  const likeWeight = engagementWeights?.likeWeights[channel] ?? CHANNEL_LIKE_WEIGHT[channel];

  // engagement 데이터가 없으면 Bayesian Prior 사용
  if (viewCount === 0 && commentCount === 0 && likeCount === 0) {
    // 뉴스는 engagement 없이 스크랩되는 경우가 많으므로 baseline 상향
    if (channel === 'news') return categoryBaseline * 1.2;
    return categoryBaseline;
  }

  // 소스별 통계 우선, 부족하면 채널 통계 fallback (뉴스는 최소 5샘플)
  const minSample = channel === 'news' ? 5 : 10;
  let stats = sourceStatsMap.get(sourceKey);
  if (!stats || stats.sampleCount < minSample) {
    stats = channelStatsMap.get(channel);
  }
  if (!stats || stats.sampleCount < 10) {
    const raw = Math.log1p(viewCount) + Math.log1p(commentCount) * commentWeight + Math.log1p(likeCount) * likeWeight;
    return Math.max(raw, 0.5);
  }

  const safeDiv = (num: number, denom: number) => denom > 0.01 ? num / denom : 0;
  const zViews = safeDiv(Math.log1p(viewCount) - stats.meanLogViews, stats.stddevLogViews);
  const zComments = safeDiv(Math.log1p(commentCount) - stats.meanLogComments, stats.stddevLogComments);
  const zLikes = safeDiv(Math.log1p(likeCount) - stats.meanLogLikes, stats.stddevLogLikes);

  // 메트릭 완전성 보정: 좋아요 미수집 소스의 가중치를 조회수/댓글수에 비례 재분배
  // 총 가중 예산(1.0 + commentWeight + likeWeight)은 동일하게 유지
  const hasLikes = sourceHasLikeData(sourceStatsMap, sourceKey);
  let adjViewW: number, adjCommentW: number, adjLikeW: number;
  if (hasLikes) {
    adjViewW = 1.0;
    adjCommentW = commentWeight;
    adjLikeW = likeWeight;
  } else {
    const totalBudget = 1.0 + commentWeight + likeWeight;
    const baseBudget = 1.0 + commentWeight;
    const scale = totalBudget / baseBudget;
    adjViewW = 1.0 * scale;
    adjCommentW = commentWeight * scale;
    adjLikeW = 0; // 좋아요 미수집 → 가중치 0
  }

  // z-score를 양수 범위로 시프트: 평균 = 2.0, 1시그마 위 = 3.0, 상한 20.0
  const raw = 2.0 + zViews * adjViewW + zComments * adjCommentW + zLikes * adjLikeW;
  return Math.max(Math.min(raw, 20.0), 0.5);
}

/** Engagement 스냅샷 기반 velocity 계산 */
export async function calculateVelocityMap(pool: Pool): Promise<Map<number, VelocityData>> {
  const { rows } = await pool.query<{
    post_id: number;
    earliest_views: number;
    latest_views: number;
    earliest_comments: number;
    latest_comments: number;
    earliest_likes: number;
    latest_likes: number;
    hours_delta: number;
  }>(`
    WITH snapshots AS (
      SELECT post_id, view_count, comment_count, like_count, captured_at,
        FIRST_VALUE(view_count) OVER w AS earliest_views,
        LAST_VALUE(view_count) OVER w AS latest_views,
        FIRST_VALUE(comment_count) OVER w AS earliest_comments,
        LAST_VALUE(comment_count) OVER w AS latest_comments,
        FIRST_VALUE(like_count) OVER w AS earliest_likes,
        LAST_VALUE(like_count) OVER w AS latest_likes,
        EXTRACT(EPOCH FROM (MAX(captured_at) OVER w - MIN(captured_at) OVER w)) / 3600.0 AS hours_delta
      FROM engagement_snapshots
      WHERE captured_at > NOW() - INTERVAL '2 hours'
      WINDOW w AS (PARTITION BY post_id ORDER BY captured_at
                   ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
    )
    SELECT DISTINCT ON (post_id)
      post_id, earliest_views, latest_views, earliest_comments, latest_comments,
      earliest_likes, latest_likes, hours_delta
    FROM snapshots
    WHERE hours_delta > 0.15
  `);

  const map = new Map<number, VelocityData>();
  for (const r of rows) {
    const delta = Math.max(r.hours_delta, 0.17); // 최소 10분
    map.set(r.post_id, {
      viewVelocity: (r.latest_views - r.earliest_views) / delta,
      commentVelocity: (r.latest_comments - r.earliest_comments) / delta,
      likeVelocity: (r.latest_likes - r.earliest_likes) / delta,
    });
  }
  return map;
}

/** Velocity → bonus 변환 [1.0, 1.5] */
export function velocityToBonus(velocity: VelocityData | undefined): number {
  if (!velocity) return 1.0;
  const score = Math.log1p(velocity.viewVelocity) + Math.log1p(velocity.commentVelocity) * 2.0 + Math.log1p(velocity.likeVelocity) * 2.5;
  return 1.0 + Math.min(score / 10.0, 0.5);
}

/** 클러스터 보너스: 로그 곡선 + 카테고리 다양성 + 뉴스 출처 다양성 [1.0, 3.0] */
export async function calculateClusterBonusMap(pool: Pool): Promise<Map<number, number>> {
  const { rows } = await pool.query<{
    canonical_post_id: number;
    member_count: number;
    category_diversity: number;
    source_diversity: number;
    news_outlet_count: number;
  }>(`
    SELECT pc.canonical_post_id, pc.member_count,
      COUNT(DISTINCT p.category)::int AS category_diversity,
      COUNT(DISTINCT p.source_key)::int AS source_diversity,
      COUNT(DISTINCT CASE WHEN p.category = 'news' THEN p.source_key END)::int AS news_outlet_count
    FROM post_clusters pc
    JOIN post_cluster_members pcm ON pcm.cluster_id = pc.id
    JOIN posts p ON p.id = pcm.post_id
    WHERE pc.cluster_created_at > NOW() - INTERVAL '24 hours'
    GROUP BY pc.canonical_post_id, pc.member_count
  `);

  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.member_count <= 1) continue;
    const rawCluster = 1.0 + 0.3 * Math.log2(r.member_count);
    const categoryDiv = 1.0 + 0.1 * Math.min(r.category_diversity - 1, 3);
    // 다음 포커스 핵심: 여러 뉴스사 동시 보도 = 높은 가중치
    const newsOutletDiv = r.news_outlet_count >= 3
      ? 1.0 + 0.15 * Math.min(r.news_outlet_count - 2, 5)
      : 1.0;
    map.set(r.canonical_post_id, Math.min(rawCluster * categoryDiv * newsOutletDiv, 3.0));
  }
  return map;
}

// ─── News: Portal Rank Map (naver_news_ranking → cluster propagation) ───

const PORTAL_RANK_MAX = 30;
const PORTAL_RANK_DECAY_HOURS = 6;

/**
 * 포털 소스별 점수 승수 및 클러스터 전파율.
 * 네이버 독점 완화: 기존 naver 1.0× / nate 0.6× / zum 0.5× 는 2배 차이로
 * 인기순 탭이 네이버로 쏠렸다. 상한을 0.90 으로 낮추고 나머지를 0.70~0.80 으로 올려
 * 소스 다양성을 확보한다. google_news_kr / bigkinds_issues 도 포털 랭킹 풀에 포함.
 */
const PORTAL_SOURCE_CONFIG: Record<string, { scoreMultiplier: number; propagationRate: number }> = {
  naver_news_ranking: { scoreMultiplier: 0.90, propagationRate: 0.75 },
  nate_news:          { scoreMultiplier: 0.80, propagationRate: 0.60 },
  zum_news:           { scoreMultiplier: 0.75, propagationRate: 0.55 },
  google_news_kr:     { scoreMultiplier: 0.80, propagationRate: 0.60 },
  bigkinds_issues:    { scoreMultiplier: 0.90, propagationRate: 0.70 },
};
const PORTAL_SOURCE_KEYS = Object.keys(PORTAL_SOURCE_CONFIG);

/** 네이버/네이트/ZUM 뉴스 랭킹 순위 → 같은 클러스터 뉴스에 [0, 10] 점수 전파 */
export async function calculatePortalRankMap(pool: Pool): Promise<Map<number, number>> {
  // 1) 포털 소스들에서 rank 추출
  const { rows: portalRows } = await pool.query<{
    id: number;
    source_key: string;
    rank: number;
    scraped_at: Date;
  }>(`
    SELECT p.id,
           p.source_key,
           (p.metadata->>'rank')::int AS rank,
           p.scraped_at
    FROM posts p
    WHERE p.source_key = ANY($1)
      AND p.scraped_at > NOW() - INTERVAL '24 hours'
      AND p.metadata->>'rank' IS NOT NULL
  `, [PORTAL_SOURCE_KEYS]);

  if (portalRows.length === 0) return new Map();

  const now = Date.now();
  const portalScoreById = new Map<number, number>();
  const portalSourceById = new Map<number, string>();

  for (const r of portalRows) {
    const rank = Math.min(Math.max(r.rank, 1), PORTAL_RANK_MAX);
    const rawScore = 10.0 * (1.0 - (rank - 1) / PORTAL_RANK_MAX);
    const hoursAge = (now - new Date(r.scraped_at).getTime()) / 3_600_000;
    const decayed = rawScore * Math.exp(-LN2 * hoursAge / PORTAL_RANK_DECAY_HOURS);
    // 소스별 승수 적용 (naver=1.0, nate=0.6, zum=0.5)
    const multiplier = PORTAL_SOURCE_CONFIG[r.source_key]?.scoreMultiplier ?? 0.5;
    const score = decayed * multiplier;
    const existing = portalScoreById.get(r.id) ?? 0;
    if (score > existing) {
      portalScoreById.set(r.id, score);
      portalSourceById.set(r.id, r.source_key);
    }
  }

  // 2) 클러스터를 통해 같은 이슈의 다른 뉴스에 전파
  const portalIds = [...portalScoreById.keys()];
  if (portalIds.length === 0) return portalScoreById;

  const { rows: clusterRows } = await pool.query<{
    portal_post_id: number;
    member_post_id: number;
  }>(`
    SELECT pcm_portal.post_id AS portal_post_id,
           pcm_sibling.post_id AS member_post_id
    FROM post_cluster_members pcm_portal
    JOIN post_cluster_members pcm_sibling ON pcm_sibling.cluster_id = pcm_portal.cluster_id
    JOIN posts p ON p.id = pcm_sibling.post_id
    WHERE pcm_portal.post_id = ANY($1)
      AND pcm_sibling.post_id != pcm_portal.post_id
      AND p.category IN ('news', 'newsletter', 'portal')
  `, [portalIds]);

  const result = new Map(portalScoreById);
  for (const r of clusterRows) {
    const portalScore = portalScoreById.get(r.portal_post_id) ?? 0;
    const sourceKey = portalSourceById.get(r.portal_post_id) ?? 'naver_news_ranking';
    // 소스별 차등 전파율 (naver=0.8, nate/zum=0.5)
    const propagationRate = PORTAL_SOURCE_CONFIG[sourceKey]?.propagationRate ?? 0.5;
    const propagated = portalScore * propagationRate;
    const existing = result.get(r.member_post_id) ?? 0;
    result.set(r.member_post_id, Math.max(existing, propagated));
  }

  return result;
}

// ─── News: Cluster Importance Map (매체 수 + 티어 다양성) ───

/** 소스 키 → 티어 번호 매핑 (클러스터 중요도 다양성 계산용) */
const SOURCE_TIER: Record<string, number> = {
  yna: 1, naver_news_ranking: 1, bigkinds_issues: 1,
  sbs: 2, kbs: 2, mbc: 2, jtbc: 2, chosun: 2, joins: 2,
  khan: 3, mk: 3, hani: 3, donga: 3, hankyung: 3, ytn: 3, etnews: 3,
  daum_news: 4, newsis: 4, nate_news: 4, zum_news: 4, google_news_kr: 4,
};

/** v7: 임베딩 centroid 평균 거리 기반 "서로 다른 사건 단위" importance.
 *  같은 엔티티를 반복 보도한 클러스터는 d_avg가 낮아 억제,
 *  서로 다른 각도(사실/반응/분석)를 다룬 클러스터는 d_avg가 높아 가중.
 *  Formula: log2(1 + uniqueOutlets) × (1 + min(d_avg × 2, 3)), clamp [0, 10]. */
export function clusterImportanceFromVectors(
  uniqueOutlets: number,
  vectors: readonly Float32Array[],
): number {
  if (uniqueOutlets <= 1 || vectors.length < 2) return 0;

  // centroid = 평균 벡터
  const dim = vectors[0].length;
  const centroid = new Float32Array(dim);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) centroid[i] += v[i];
  }
  for (let i = 0; i < dim; i++) centroid[i] /= vectors.length;

  // d_avg = 평균 코사인 거리 (1 - cosSim) ∈ [0, 1]
  let distSum = 0;
  for (const v of vectors) {
    distSum += 1 - cosineSimVectors(v, centroid);
  }
  const dAvg = distSum / vectors.length;

  const outletBase = Math.log2(1 + uniqueOutlets); // 2→1.58, 4→2.32, 8→3.17
  const diversityMult = 1 + Math.min(dAvg * 2, 3); // d_avg clamp +3
  return Math.min(outletBase * diversityMult, 10);
}

/** v7: entity-based clusterImportance — 임베딩 centroid 거리 + 티어 다양성.
 *  임베딩이 ≥2개 있는 클러스터는 v7 공식, 없거나 1개면 v6 공식으로 per-cluster fallback. */
export async function calculateClusterImportanceMapV7(pool: Pool): Promise<Map<number, number>> {
  const { rows } = await pool.query<{
    cluster_id: number;
    member_ids: number[];
    source_keys: string[];
    news_source_count: number;
  }>(`
    SELECT pcm.cluster_id,
           ARRAY_AGG(pcm.post_id) AS member_ids,
           ARRAY_AGG(DISTINCT p.source_key) AS source_keys,
           COUNT(DISTINCT CASE WHEN p.category IN ('news','newsletter','portal') THEN p.source_key END)::int AS news_source_count
    FROM post_cluster_members pcm
    JOIN posts p ON p.id = pcm.post_id
    JOIN post_clusters pc ON pc.id = pcm.cluster_id
    WHERE pc.cluster_created_at > NOW() - INTERVAL '24 hours'
    GROUP BY pcm.cluster_id
  `);

  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.news_source_count <= 1) continue;

    const uniqueOutlets = r.news_source_count;
    const tiers = new Set(r.source_keys.map(sk => SOURCE_TIER[sk] ?? 5));
    const tierBonus = 1.0 + 0.1 * Math.min(tiers.size - 1, 3);

    // 클러스터 멤버 임베딩 수집
    const vectors: Float32Array[] = [];
    for (const pid of r.member_ids) {
      const v = getEmbedding(pid);
      if (v) vectors.push(v);
    }

    let importance: number;
    if (vectors.length >= 2) {
      // v7: centroid 거리 기반
      importance = clusterImportanceFromVectors(uniqueOutlets, vectors) * tierBonus;
    } else {
      // per-cluster fallback: v6 공식 (매체수 × 티어)
      const mediaScore = Math.min(10.0, 3.0 * Math.log2(uniqueOutlets));
      importance = mediaScore * tierBonus;
    }

    const clamped = Math.min(importance, 10.0);
    for (const pid of r.member_ids) {
      map.set(pid, clamped);
    }
  }
  return map;
}

/** v6 (legacy): 클러스터 내 뉴스 매체 수 + 티어 다양성 → [0, 10] 중요도 */
export async function calculateClusterImportanceMap(pool: Pool): Promise<Map<number, number>> {
  const { rows } = await pool.query<{
    member_post_id: number;
    source_keys: string[];
    news_source_count: number;
  }>(`
    SELECT pcm.post_id AS member_post_id,
           ARRAY_AGG(DISTINCT p2.source_key) AS source_keys,
           COUNT(DISTINCT CASE WHEN p2.category IN ('news','newsletter','portal') THEN p2.source_key END)::int AS news_source_count
    FROM post_cluster_members pcm
    JOIN post_cluster_members pcm2 ON pcm2.cluster_id = pcm.cluster_id
    JOIN posts p2 ON p2.id = pcm2.post_id
    JOIN post_clusters pc ON pc.id = pcm.cluster_id
    WHERE pc.cluster_created_at > NOW() - INTERVAL '24 hours'
    GROUP BY pcm.post_id
  `);

  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.news_source_count <= 1) continue;

    // 로그 스케일: 2개=3, 4개=6, 8개+=10
    const mediaScore = Math.min(10.0, 3.0 * Math.log2(r.news_source_count));

    // 티어 다양성 보너스: 서로 다른 티어가 많을수록 중요도 상승
    const tiers = new Set(r.source_keys.map(sk => SOURCE_TIER[sk] ?? 5));
    const tierBonus = 1.0 + 0.1 * Math.min(tiers.size - 1, 3);

    map.set(r.member_post_id, Math.min(mediaScore * tierBonus, 10.0));
  }
  return map;
}

// ─── News: Trend Signal Normalization ───

/** 기존 trendSignalBonus [1.0, 1.8] → [0, 10] 정규화 */
export function normalizeTrendSignal(raw: number): number {
  // raw 1.0 → 0, raw 1.8 → 10 (선형)
  return Math.min(Math.max((raw - 1.0) / 0.08, 0), 10);
}

/** 카테고리별 engagement baseline 계산 (zero-engagement fallback) */
export async function calculateCategoryBaselines(pool: Pool): Promise<Map<string, number>> {
  const { rows } = await pool.query<{
    category: string;
    median_engagement: number;
  }>(`
    SELECT COALESCE(category, 'unknown') AS category,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ln(1 + view_count))::float AS median_engagement
    FROM posts
    WHERE scraped_at > NOW() - INTERVAL '24 hours' AND view_count > 0
    GROUP BY category
  `);

  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.category, r.median_engagement);
  }
  return map;
}

// ─── News: Engagement Signal Map (참여도 신호) ───

/** 뉴스 채널 중 engagement > 0인 포스트의 정규화 점수를 [0, 10]으로 매핑 */
export async function calculateNewsEngagementMap(pool: Pool): Promise<Map<number, number>> {
  // 뉴스 채널의 engagement 통계 (24시간, view_count > 0)
  const { rows: statsRows } = await pool.query<{
    mean_log: number;
    stddev_log: number;
  }>(`
    SELECT AVG(ln(1 + view_count + comment_count * 3 + like_count * 2))::float AS mean_log,
           GREATEST(STDDEV(ln(1 + view_count + comment_count * 3 + like_count * 2)), 0.1)::float AS stddev_log
    FROM posts
    WHERE scraped_at > NOW() - INTERVAL '24 hours'
      AND category IN ('news', 'portal', 'newsletter')
      AND (view_count > 0 OR comment_count > 0 OR like_count > 0)
  `);

  if (statsRows.length === 0 || !statsRows[0]) return new Map();
  const { mean_log, stddev_log } = statsRows[0];

  // engagement > 0인 뉴스 포스트의 z-score → [0, 10] 매핑
  const { rows } = await pool.query<{
    id: number;
    log_eng: number;
  }>(`
    SELECT p.id,
           ln(1 + p.view_count + p.comment_count * 3 + p.like_count * 2)::float AS log_eng
    FROM posts p
    WHERE p.scraped_at > NOW() - INTERVAL '24 hours'
      AND p.category IN ('news', 'portal', 'newsletter')
      AND (p.view_count > 0 OR p.comment_count > 0 OR p.like_count > 0)
  `);

  const map = new Map<number, number>();
  for (const r of rows) {
    // z-score → [0, 10]: z=0 → 5, z=+2 → 10, z=-2 → 0
    const zScore = (r.log_eng - mean_log) / stddev_log;
    const normalized = Math.min(Math.max((zScore + 2) * 2.5, 0), 10);
    map.set(r.id, normalized);
  }
  return map;
}

// ─── News: YouTube Cross Signal (방송사 YouTube engagement → 매칭 news 가산) ───

const YOUTUBE_NEWS_SOURCE_KEYS = [
  'youtube_sbs_news', 'youtube_ytn', 'youtube_mbc_news',
  'youtube_kbs_news', 'youtube_jtbc_news',
];

// 토큰 매칭 false-positive 차단용 stopword (방송 공통어/장르어).
// 2자 이상 한글 토큰 추출 후 이 집합을 제거한 잔여 토큰으로 교집합 카운트.
const YT_CROSS_STOPWORDS = new Set([
  '속보', '뉴스', '단독', '영상', '라이브', '풀영상', '종합', '오늘', '내일', '어제',
  '현장', '인터뷰', '브리핑', '공식', '한국', '미국', '일본', '중국', '북한',
  '대통령', '정부', '국회', '지금', '직접', '발표', '기자', '특보', '아침', '저녁',
  '이슈', '집중', '취재', '리포트', '전체', '하이라이트', '풀버전', '클립', '뉴스룸',
  '정치', '사회', '경제', '국제', '문화', '연예', '스포츠', '날씨',
]);

/** 한글 2자+ 토큰 추출 (stopword 제외). normalizeTitle 과 동일 정규화 후 split. */
function extractKoreanTokens(title: string): Set<string> {
  const cleaned = title
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = new Set<string>();
  for (const tok of cleaned.split(' ')) {
    if (tok.length < 2) continue;
    if (YT_CROSS_STOPWORDS.has(tok)) continue;
    tokens.add(tok);
  }
  return tokens;
}

/**
 * 방송사 YouTube 뉴스 영상의 engagement 를 동일 사건의 news 기사 점수에 전파.
 *
 * 알고리즘:
 *  1) 24h × YOUTUBE_NEWS_SOURCE_KEYS × view_count > 0 영상 후보 수집
 *  2) ln(1 + views + comments*3 + likes*2) z-score → [0, 10] 정규화 (newsEngagement 와 동일 스케일)
 *  3) 매칭:
 *     - 1순위 클러스터 전파: 같은 cluster 의 news/portal/newsletter post 에 영상 점수 max 전파
 *       (cluster size > 20 이면 점수 × 20/size 감쇠로 폭주 방지)
 *     - 2순위 토큰 폴백: 클러스터 미가입 영상은 24h news 중 stopword 제외 토큰 2개+ 공유 시 ×0.6 감쇠 전파
 *  4) 한 news post 에 여러 영상이 매칭되면 max
 *  5) 최종 점수 × 0.5 (매칭 불확실성 할인)
 */
export async function calculateYoutubeNewsCrossSignal(pool: Pool): Promise<Map<number, number>> {
  // Step 1: 영상 후보 + 통계
  const { rows: videoRows } = await pool.query<{
    id: number;
    title: string;
    view_count: number;
    comment_count: number;
    like_count: number;
  }>(
    `SELECT id, title, view_count, comment_count, like_count
     FROM posts
     WHERE source_key = ANY($1::text[])
       AND scraped_at > NOW() - INTERVAL '24 hours'
       AND view_count > 0`,
    [YOUTUBE_NEWS_SOURCE_KEYS]
  );

  if (videoRows.length === 0) return new Map();

  // Step 2: log-engagement → z-score → [0, 10]
  const logEng = videoRows.map(v =>
    Math.log(1 + v.view_count + v.comment_count * 3 + v.like_count * 2)
  );
  const mean = logEng.reduce((a, b) => a + b, 0) / logEng.length;
  const variance = logEng.reduce((a, b) => a + (b - mean) ** 2, 0) / logEng.length;
  const stddev = Math.max(Math.sqrt(variance), 0.1);

  const videoScore = new Map<number, number>(); // videoPostId → [0,10]
  for (let i = 0; i < videoRows.length; i++) {
    const z = (logEng[i] - mean) / stddev;
    const norm = Math.min(Math.max((z + 2) * 2.5, 0), 10);
    videoScore.set(videoRows[i].id, norm);
  }

  const videoIds = videoRows.map(v => v.id);

  // Step 3a: 클러스터 전파
  // 영상 → cluster → 같은 cluster 의 news 카테고리 멤버 조회
  const { rows: clusterPropRows } = await pool.query<{
    video_id: number;
    news_post_id: number;
    cluster_size: number;
  }>(
    `WITH video_clusters AS (
       SELECT pcm.post_id AS video_id, pcm.cluster_id
       FROM post_cluster_members pcm
       WHERE pcm.post_id = ANY($1::bigint[])
     ),
     cluster_sizes AS (
       SELECT cluster_id, COUNT(*)::int AS sz
       FROM post_cluster_members
       WHERE cluster_id IN (SELECT cluster_id FROM video_clusters)
       GROUP BY cluster_id
     )
     SELECT vc.video_id, pcm2.post_id AS news_post_id, cs.sz AS cluster_size
     FROM video_clusters vc
     JOIN post_cluster_members pcm2 ON pcm2.cluster_id = vc.cluster_id
     JOIN posts p ON p.id = pcm2.post_id
     JOIN cluster_sizes cs ON cs.cluster_id = vc.cluster_id
     WHERE p.category IN ('news', 'portal', 'newsletter')
       AND p.scraped_at > NOW() - INTERVAL '24 hours'`,
    [videoIds]
  );

  const result = new Map<number, number>(); // newsPostId → [0,10]
  const matchedVideoIds = new Set<number>();
  for (const r of clusterPropRows) {
    matchedVideoIds.add(r.video_id);
    const baseScore = videoScore.get(r.video_id) ?? 0;
    if (baseScore <= 0) continue;
    // 큰 클러스터는 점수 감쇠 (한 영상이 수십 기사에 폭주 방지)
    const sizeAdj = r.cluster_size > 20 ? baseScore * (20 / r.cluster_size) : baseScore;
    const prev = result.get(r.news_post_id) ?? 0;
    if (sizeAdj > prev) result.set(r.news_post_id, sizeAdj);
  }

  // Step 3b: 토큰 매칭 폴백 (클러스터 미매칭 영상만)
  const unmatchedVideos = videoRows.filter(v => !matchedVideoIds.has(v.id));
  if (unmatchedVideos.length > 0) {
    const { rows: newsRows } = await pool.query<{ id: number; title: string }>(
      `SELECT id, title FROM posts
       WHERE category IN ('news', 'portal', 'newsletter')
         AND scraped_at > NOW() - INTERVAL '24 hours'`
    );
    const newsTokens = newsRows.map(n => ({ id: n.id, tokens: extractKoreanTokens(n.title) }));

    for (const v of unmatchedVideos) {
      const vTokens = extractKoreanTokens(v.title);
      if (vTokens.size < 2) continue;
      const baseScore = (videoScore.get(v.id) ?? 0) * 0.6;
      if (baseScore <= 0) continue;
      for (const n of newsTokens) {
        let shared = 0;
        for (const t of vTokens) if (n.tokens.has(t)) shared++;
        if (shared < 2) continue;
        const prev = result.get(n.id) ?? 0;
        if (baseScore > prev) result.set(n.id, baseScore);
      }
    }
  }

  // Step 5: 최종 0.5 할인
  for (const [k, v] of result) result.set(k, v * 0.5);

  return result;
}

// ─── News: Freshness Signal (v7 5번째 가산 항) ───

const FRESHNESS_SIGNAL_HALF_LIFE_MIN = 45;

/** v7: 발행 후 경과 시간을 [0, 10] 신호로 환산 (뉴스 signalScore 5번째 항).
 *  Formula: 10 × exp(-ln2 × age / 45) — 45분 반감기, 연속 함수.
 *  Age=0→10, age=30→6.3, age=45→5.0, age=60→4.0, age=120→1.6, age=∞→0.
 *  v6 외곽 freshnessBonus(곱셈 1.3/1.15/1.075/1.0)를 대체 — signalScore 내부 가산항으로 흡수. */
export function freshnessSignal(ageMinutes: number): number {
  if (!Number.isFinite(ageMinutes) || ageMinutes <= 0) return 10;
  return 10 * Math.exp(-LN2 * ageMinutes / FRESHNESS_SIGNAL_HALF_LIFE_MIN);
}
