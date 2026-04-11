import type { Pool } from 'pg';
import type { Channel } from './scoring-weights.js';
import { CHANNEL_HALF_LIFE_MINUTES, DEFAULT_HALF_LIFE_MINUTES } from './scoring-weights.js';

const LN2 = Math.LN2;

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

export function communityVelocityToBonus(velocity: VelocityData | undefined): number {
  if (!velocity) return 1.0;
  const score = Math.log1p(velocity.viewVelocity)
    + Math.log1p(velocity.commentVelocity) * 3.0
    + Math.log1p(velocity.likeVelocity) * 3.0;
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

export async function detectBreakingNews(pool: Pool): Promise<Map<number, number>> {
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
  return map;
}

// ─── Sub-calculations ───

/** 소스별 Z-Score 정규화용 통계 계산 + DB 캐싱 */
export async function calculateSourceStats(pool: Pool): Promise<Map<string, SourceStats>> {
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

  return map;
}

/** 채널별 통계 계산 (소스 샘플 부족 시 fallback) */
export async function calculateChannelStats(pool: Pool): Promise<Map<Channel, SourceStats>> {
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

/** Z-Score 정규화된 engagement 계산 (채널 인식) */
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
  // z-score를 양수 범위로 시프트: 평균 = 2.0, 1시그마 위 = 3.0, 상한 20.0
  const raw = 2.0 + zViews + zComments * commentWeight + zLikes * likeWeight;
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

/** 네이버 뉴스 랭킹 순위 → 같은 클러스터 뉴스에 [0, 10] 점수 전파 */
export async function calculatePortalRankMap(pool: Pool): Promise<Map<number, number>> {
  // 1) naver_news_ranking 포스트에서 rank 추출
  const { rows: portalRows } = await pool.query<{
    id: number;
    rank: number;
    scraped_at: Date;
  }>(`
    SELECT p.id,
           (p.metadata->>'rank')::int AS rank,
           p.scraped_at
    FROM posts p
    WHERE p.source_key = 'naver_news_ranking'
      AND p.scraped_at > NOW() - INTERVAL '24 hours'
      AND p.metadata->>'rank' IS NOT NULL
  `);

  if (portalRows.length === 0) return new Map();

  const now = Date.now();
  const portalScoreById = new Map<number, number>();

  for (const r of portalRows) {
    const rank = Math.min(Math.max(r.rank, 1), PORTAL_RANK_MAX);
    // rank 1 → 10, rank 30 → ~0.69 (선형 보간)
    const rawScore = 10.0 * (1.0 - (rank - 1) / PORTAL_RANK_MAX);
    // 수집 시점으로부터 시간감쇠
    const hoursAge = (now - new Date(r.scraped_at).getTime()) / 3_600_000;
    const decayed = rawScore * Math.exp(-LN2 * hoursAge / PORTAL_RANK_DECAY_HOURS);
    portalScoreById.set(r.id, decayed);
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
    // 클러스터 멤버에게는 포털 점수의 80% 전파 (원본보다 약간 낮게)
    const propagated = portalScore * 0.8;
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

/** 클러스터 내 뉴스 매체 수 + 티어 다양성 → [0, 10] 중요도 */
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
