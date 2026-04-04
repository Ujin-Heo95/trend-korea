import type { Pool } from 'pg';

const LN2 = Math.LN2;

// ─── Channel-specific Decay ───
// 커뮤니티/SNS는 실시간성 중시, 영상은 수명이 김
const CHANNEL_HALF_LIFE_MINUTES: Record<Channel, number> = {
  community: 150,    // 2.5h → 24h후 0.06%
  sns: 120,          // 2h → 24h후 0.002%
  news: 240,         // 4h → 24h후 1.56%
  specialized: 300,  // 5h → 24h후 0.46%
  video: 360,        // 6h → 24h후 6.25% (기존 유지)
};
const DEFAULT_HALF_LIFE_MINUTES = 300; // fallback

// ─── Channel Mapping ───

export type Channel = 'community' | 'news' | 'video' | 'sns' | 'specialized';

const CATEGORY_TO_CHANNEL: Record<string, Channel> = {
  community: 'community', blog: 'community',
  news: 'news', press: 'news', newsletter: 'news', government: 'news',
  video: 'video', video_popular: 'video',
  sns: 'sns',
  tech: 'specialized', techblog: 'specialized', finance: 'specialized',
  deals: 'specialized', alert: 'specialized', trend: 'specialized',
  sports: 'specialized', movie: 'specialized', performance: 'specialized',
  travel: 'specialized', music: 'specialized', books: 'specialized', ott: 'specialized',
};

export function getChannel(category: string | null): Channel {
  return (category ? CATEGORY_TO_CHANNEL[category] : undefined) ?? 'specialized';
}

// ─── Source & Category Weights ───
// T1(2.5) 통신사·집계  T2(2.2) 방송사+조중  T3(2.0) 주요 언론
// T4(1.8) 포털·통합  T5(1.3~1.5) 테크  커뮤니티(1.0)  기본(0.8)

const SOURCE_WEIGHTS: Record<string, number> = {
  // T1: 통신사 + 뉴스 집계
  yna: 2.5, naver_news_ranking: 2.5, bigkinds_issues: 2.5,
  // T2: 방송사 + 조중
  sbs: 2.2, kbs: 2.2, mbc: 2.2, jtbc: 2.2, chosun: 2.2, joins: 2.2,
  // T3: 주요 언론
  khan: 2.0, mk: 2.0, hani: 2.0, donga: 2.0, hankyung: 2.0, ytn: 2.0,
  // T4: 포털·통합
  daum_news: 1.8, google_news_kr: 1.6, newsis: 1.8,
  // YouTube (정규 언론사 = T1, 일반 = 1.2)
  youtube: 2.5,
  // 테크
  geeknews: 1.3, yozm: 1.3, etnews: 1.5,
  naver_d2: 1.1, kakao_tech: 1.1, toss_tech: 1.1,
  // 커뮤니티
  dcinside: 1.0, bobaedream: 1.0, ruliweb: 1.0, theqoo: 1.0,
  instiz: 1.0, natepann: 1.0,
  // 기타
  ppomppu: 1.0,
  kopis_boxoffice: 1.2,
  sports_donga: 1.2,
  ruliweb_hot: 0.9, clien_jirum: 0.9,
  quasarzone_deal: 0.9, dcinside_hotdeal: 0.9,
};
const DEFAULT_SOURCE_WEIGHT = 0.8;

const CATEGORY_WEIGHTS: Record<string, number> = {
  alert: 1.25, news: 1.20, trend: 1.15, tech: 1.15,
  finance: 1.10, community: 1.08, video: 0.95,
  movie: 1.05, performance: 1.05, travel: 1.05, music: 1.05, books: 1.05, ott: 1.05,
  deals: 1.00, government: 0.85, newsletter: 0.80,
};
const DEFAULT_CATEGORY_WEIGHT = 1.00;

export function getSourceWeight(sourceKey: string): number {
  return SOURCE_WEIGHTS[sourceKey] ?? DEFAULT_SOURCE_WEIGHT;
}

export function getCategoryWeight(category: string | null): number {
  return category ? (CATEGORY_WEIGHTS[category] ?? DEFAULT_CATEGORY_WEIGHT) : DEFAULT_CATEGORY_WEIGHT;
}

export function getHalfLife(channel: Channel): number {
  return CHANNEL_HALF_LIFE_MINUTES[channel] ?? DEFAULT_HALF_LIFE_MINUTES;
}

/** 소스별 게시물 볼륨 과대표현 억제 (중앙값 대비 로그 감쇄, 하한 0.7) */
export function volumeDampeningFactor(sourceCount: number, medianCount: number): number {
  if (sourceCount <= medianCount || medianCount <= 0) return 1.0;
  return Math.max(0.7, 1.0 - 0.15 * Math.log(sourceCount / medianCount));
}

// ─── Score Component Types ───

export interface ScoreFactors {
  normalizedEngagement: number;
  decay: number;
  sourceWeight: number;
  categoryWeight: number;
  velocityBonus: number;
  clusterBonus: number;
}

interface SourceStats {
  meanLogViews: number;
  stddevLogViews: number;
  meanLogComments: number;
  stddevLogComments: number;
  meanLogLikes: number;
  stddevLogLikes: number;
  sampleCount: number;
}

interface VelocityData {
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
    * factors.clusterBonus;
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

// ─── Sub-calculations ───

/** 소스별 Z-Score 정규화용 통계 계산 + DB 캐싱 */
async function calculateSourceStats(pool: Pool): Promise<Map<string, SourceStats>> {
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
    WHERE scraped_at > NOW() - INTERVAL '24 hours' AND view_count > 0
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
async function calculateChannelStats(pool: Pool): Promise<Map<Channel, SourceStats>> {
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
        WHEN category IN ('news','press','newsletter','government') THEN 'news'
        WHEN category IN ('video','video_popular') THEN 'video'
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
    WHERE scraped_at > NOW() - INTERVAL '24 hours' AND view_count > 0
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

/** 채널별 댓글 가중치 */
const CHANNEL_COMMENT_WEIGHT: Record<Channel, number> = {
  community: 1.5,    // 커뮤니티 댓글은 참여 지표로 중요
  news: 0.5,         // 뉴스 댓글은 덜 의미 있음
  video: 1.0,        // 영상 댓글은 보통
  sns: 1.0,          // SNS 댓글은 보통
  specialized: 1.0,  // 테크블로그 등
};

/** 채널별 좋아요 가중치 */
const CHANNEL_LIKE_WEIGHT: Record<Channel, number> = {
  community: 2.0,    // 커뮤니티 추천은 가장 강한 품질 지표
  sns: 1.5,          // SNS 좋아요는 높은 참여
  video: 1.2,        // 영상 좋아요는 적당
  specialized: 0.8,  // 전문 사이트는 보통
  news: 0.3,         // 뉴스 좋아요는 약한 신호 (대부분 없음)
};

/** Z-Score 정규화된 engagement 계산 (채널 인식) */
function normalizeEngagement(
  viewCount: number,
  commentCount: number,
  likeCount: number,
  sourceKey: string,
  sourceStatsMap: Map<string, SourceStats>,
  channelStatsMap: Map<Channel, SourceStats>,
  channel: Channel,
  categoryBaseline: number,
): number {
  const commentWeight = CHANNEL_COMMENT_WEIGHT[channel];
  const likeWeight = CHANNEL_LIKE_WEIGHT[channel];

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

  const zViews = (Math.log1p(viewCount) - stats.meanLogViews) / stats.stddevLogViews;
  const zComments = (Math.log1p(commentCount) - stats.meanLogComments) / stats.stddevLogComments;
  const zLikes = (Math.log1p(likeCount) - stats.meanLogLikes) / stats.stddevLogLikes;
  // z-score를 양수 범위로 시프트: 평균 = 2.0, 1시그마 위 = 3.0
  return Math.max(2.0 + zViews + zComments * commentWeight + zLikes * likeWeight, 0.5);
}

/** Engagement 스냅샷 기반 velocity 계산 */
async function calculateVelocityMap(pool: Pool): Promise<Map<number, VelocityData>> {
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
function velocityToBonus(velocity: VelocityData | undefined): number {
  if (!velocity) return 1.0;
  const score = Math.log1p(velocity.viewVelocity) + Math.log1p(velocity.commentVelocity) * 2.0 + Math.log1p(velocity.likeVelocity) * 2.5;
  return 1.0 + Math.min(score / 10.0, 0.5);
}

/** 클러스터 보너스: 로그 곡선 + 카테고리 다양성 + 뉴스 출처 다양성 [1.0, 3.0] */
async function calculateClusterBonusMap(pool: Pool): Promise<Map<number, number>> {
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
      COUNT(DISTINCT CASE WHEN p.category IN ('news','press') THEN p.source_key END)::int AS news_outlet_count
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

/** 카테고리별 engagement baseline 계산 (zero-engagement fallback) */
async function calculateCategoryBaselines(pool: Pool): Promise<Map<string, number>> {
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

// ─── Main Batch Calculator ───

/** Batch-calculate scores for all posts in the last 24 hours */
export async function calculateScores(pool: Pool): Promise<number> {
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
      view_count: number;
      comment_count: number;
      like_count: number;
      scraped_at: Date;
    }>(`
      SELECT p.id, p.source_key, p.category, p.view_count, p.comment_count, p.like_count, p.scraped_at
      FROM posts p
      WHERE p.scraped_at > NOW() - INTERVAL '24 hours'
        AND COALESCE(p.category, '') NOT IN ('movie', 'performance', 'music', 'books', 'ott', 'deals')
    `),
  ]);

  const rows = postsResult.rows;
  if (rows.length === 0) return 0;

  const now = Date.now();
  const globalBaseline = 2.0; // 카테고리 baseline도 없을 때의 최종 fallback
  const values: string[] = [];
  const params: unknown[] = [];

  // 볼륨 감쇄 + UPSERT용
  const rawScoreEntries: { postId: number; score: number; srcW: number; catW: number; sourceKey: string }[] = [];

  for (const row of rows) {
    const ageMinutes = (now - new Date(row.scraped_at).getTime()) / 60_000;
    const srcW = getSourceWeight(row.source_key);
    const catW = getCategoryWeight(row.category);
    const catBaseline = categoryBaselines.get(row.category ?? 'unknown') ?? globalBaseline;

    // Zero-engagement credibility 가중치
    let credibilityFactor = 0.8;
    if (row.view_count === 0 && row.comment_count === 0 && row.like_count === 0) {
      const hasCluster = clusterBonusMap.has(row.id);
      if (hasCluster) credibilityFactor = 1.15;
    }

    const channel = getChannel(row.category);

    const factors: ScoreFactors = {
      normalizedEngagement: normalizeEngagement(
        row.view_count, row.comment_count, row.like_count,
        row.source_key, sourceStatsMap, channelStatsMap, channel,
        catBaseline * credibilityFactor,
      ),
      decay: Math.exp(-LN2 * ageMinutes / (CHANNEL_HALF_LIFE_MINUTES[channel] ?? DEFAULT_HALF_LIFE_MINUTES)),
      sourceWeight: srcW,
      categoryWeight: catW,
      velocityBonus: velocityToBonus(velocityMap.get(row.id)),
      clusterBonus: clusterBonusMap.get(row.id) ?? 1.0,
    };

    const score = computeScore(factors);
    rawScoreEntries.push({ postId: row.id, score, srcW, catW, sourceKey: row.source_key });
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

  // Step 3: UPSERT 준비 (raw score 직접 사용)
  for (const entry of rawScoreEntries) {
    const i = params.length;
    params.push(entry.postId, entry.score, entry.srcW, entry.catW);
    values.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, NOW())`);
  }

  // Batch UPSERT in chunks of 500
  const CHUNK = 500;
  let updated = 0;
  for (let start = 0; start < values.length; start += CHUNK) {
    const chunk = values.slice(start, start + CHUNK);
    const chunkParams = params.slice(start * 4, (start + CHUNK) * 4);
    const result = await pool.query(
      `INSERT INTO post_scores (post_id, trend_score, source_weight, category_weight, calculated_at)
       VALUES ${chunk.join(',')}
       ON CONFLICT (post_id) DO UPDATE SET
         trend_score = EXCLUDED.trend_score,
         source_weight = EXCLUDED.source_weight,
         category_weight = EXCLUDED.category_weight,
         calculated_at = EXCLUDED.calculated_at`,
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
