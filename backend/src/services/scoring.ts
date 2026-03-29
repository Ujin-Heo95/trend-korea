import type { Pool } from 'pg';

const LN2 = Math.LN2;
const HALF_LIFE_MINUTES = 360; // 6시간 반감기

// ─── Source & Category Weights (기존 유지) ───

const SOURCE_WEIGHTS: Record<string, number> = {
  yna: 1.15, sbs: 1.15, khan: 1.15, mk: 1.15,
  hani: 1.10, donga: 1.10, hankyung: 1.10, geeknews: 1.10, yozm: 1.10,
  dcinside: 1.05, bobaedream: 1.05, ruliweb: 1.05, theqoo: 1.05,
  instiz: 1.05, natepann: 1.05,
  youtube: 1.03, ppomppu: 1.03,
  kopis_boxoffice: 1.10,
};
const DEFAULT_SOURCE_WEIGHT = 0.95;

const CATEGORY_WEIGHTS: Record<string, number> = {
  alert: 1.25, news: 1.20, trend: 1.15, tech: 1.15,
  finance: 1.10, community: 1.00, video: 0.95,
  movie: 1.05, performance: 1.05,
  deals: 0.90, government: 0.85, newsletter: 0.80,
};
const DEFAULT_CATEGORY_WEIGHT = 1.00;

export function getSourceWeight(sourceKey: string): number {
  return SOURCE_WEIGHTS[sourceKey] ?? DEFAULT_SOURCE_WEIGHT;
}

export function getCategoryWeight(category: string | null): number {
  return category ? (CATEGORY_WEIGHTS[category] ?? DEFAULT_CATEGORY_WEIGHT) : DEFAULT_CATEGORY_WEIGHT;
}

// ─── Score Component Types ───

export interface ScoreFactors {
  normalizedEngagement: number;
  decay: number;
  sourceWeight: number;
  categoryWeight: number;
  velocityBonus: number;
  clusterBonus: number;
  keywordMomentumBonus: number;
  trendConfirmationBonus: number;
}

interface SourceStats {
  meanLogViews: number;
  stddevLogViews: number;
  meanLogComments: number;
  stddevLogComments: number;
  sampleCount: number;
}

interface VelocityData {
  viewVelocity: number;
  commentVelocity: number;
}

// ─── Core Scoring Formula ───

export function computeScore(factors: ScoreFactors): number {
  return factors.normalizedEngagement
    * factors.decay
    * factors.sourceWeight
    * factors.categoryWeight
    * factors.velocityBonus
    * factors.clusterBonus
    * factors.keywordMomentumBonus
    * factors.trendConfirmationBonus;
}

/** Backward-compatible overload for tests / simple usage */
export function computeScoreLegacy(
  viewCount: number,
  commentCount: number,
  ageMinutes: number,
  sourceWeight: number,
  categoryWeight: number,
  clusterBonus: number = 1.0,
): number {
  const rawEngagement = Math.log1p(viewCount) + Math.log1p(commentCount) * 1.5;
  const engagement = rawEngagement > 0 ? rawEngagement : 2.0;
  const decay = Math.exp(-LN2 * ageMinutes / HALF_LIFE_MINUTES);
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
    sample_count: number;
  }>(`
    SELECT source_key,
      AVG(ln(1 + view_count))::float AS mean_log_views,
      GREATEST(STDDEV(ln(1 + view_count)), 0.1)::float AS stddev_log_views,
      AVG(ln(1 + comment_count))::float AS mean_log_comments,
      GREATEST(STDDEV(ln(1 + comment_count)), 0.1)::float AS stddev_log_comments,
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
      sampleCount: r.sample_count,
    });
  }

  // DB에 캐싱 (source_engagement_stats)
  if (rows.length > 0) {
    const values: string[] = [];
    const params: unknown[] = [];
    for (const r of rows) {
      const i = params.length;
      values.push(`($${i+1},$${i+2},$${i+3},$${i+4},$${i+5},$${i+6})`);
      params.push(r.source_key, r.mean_log_views, r.stddev_log_views,
                  r.mean_log_comments, r.stddev_log_comments, r.sample_count);
    }
    await pool.query(
      `INSERT INTO source_engagement_stats (source_key, mean_log_views, stddev_log_views, mean_log_comments, stddev_log_comments, sample_count)
       VALUES ${values.join(',')}
       ON CONFLICT (source_key) DO UPDATE SET
         mean_log_views = EXCLUDED.mean_log_views,
         stddev_log_views = EXCLUDED.stddev_log_views,
         mean_log_comments = EXCLUDED.mean_log_comments,
         stddev_log_comments = EXCLUDED.stddev_log_comments,
         sample_count = EXCLUDED.sample_count,
         calculated_at = NOW()`,
      params
    );
  }

  return map;
}

/** Z-Score 정규화된 engagement 계산 */
function normalizeEngagement(
  viewCount: number,
  commentCount: number,
  sourceKey: string,
  sourceStatsMap: Map<string, SourceStats>,
  categoryBaseline: number,
): number {
  // engagement 데이터가 없으면 Bayesian Prior 사용 (Phase C)
  if (viewCount === 0 && commentCount === 0) {
    return categoryBaseline;
  }

  const stats = sourceStatsMap.get(sourceKey);
  // 통계 부족 시 (sample < 10) log1p fallback
  if (!stats || stats.sampleCount < 10) {
    const raw = Math.log1p(viewCount) + Math.log1p(commentCount) * 1.5;
    return Math.max(raw, 0.5);
  }

  const zViews = (Math.log1p(viewCount) - stats.meanLogViews) / stats.stddevLogViews;
  const zComments = (Math.log1p(commentCount) - stats.meanLogComments) / stats.stddevLogComments;
  // z-score를 양수 범위로 시프트: 평균 = 2.0, 1시그마 위 = 3.0
  return Math.max(2.0 + zViews + zComments * 1.5, 0.5);
}

/** Engagement 스냅샷 기반 velocity 계산 */
async function calculateVelocityMap(pool: Pool): Promise<Map<number, VelocityData>> {
  const { rows } = await pool.query<{
    post_id: number;
    earliest_views: number;
    latest_views: number;
    earliest_comments: number;
    latest_comments: number;
    hours_delta: number;
  }>(`
    WITH snapshots AS (
      SELECT post_id, view_count, comment_count, captured_at,
        FIRST_VALUE(view_count) OVER w AS earliest_views,
        LAST_VALUE(view_count) OVER w AS latest_views,
        FIRST_VALUE(comment_count) OVER w AS earliest_comments,
        LAST_VALUE(comment_count) OVER w AS latest_comments,
        EXTRACT(EPOCH FROM (MAX(captured_at) OVER w - MIN(captured_at) OVER w)) / 3600.0 AS hours_delta
      FROM engagement_snapshots
      WHERE captured_at > NOW() - INTERVAL '2 hours'
      WINDOW w AS (PARTITION BY post_id ORDER BY captured_at
                   ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
    )
    SELECT DISTINCT ON (post_id)
      post_id, earliest_views, latest_views, earliest_comments, latest_comments, hours_delta
    FROM snapshots
    WHERE hours_delta > 0.15
  `);

  const map = new Map<number, VelocityData>();
  for (const r of rows) {
    const delta = Math.max(r.hours_delta, 0.17); // 최소 10분
    map.set(r.post_id, {
      viewVelocity: (r.latest_views - r.earliest_views) / delta,
      commentVelocity: (r.latest_comments - r.earliest_comments) / delta,
    });
  }
  return map;
}

/** Velocity → bonus 변환 [1.0, 1.5] */
function velocityToBonus(velocity: VelocityData | undefined): number {
  if (!velocity) return 1.0;
  const score = Math.log1p(velocity.viewVelocity) + Math.log1p(velocity.commentVelocity) * 2.0;
  return 1.0 + Math.min(score / 10.0, 0.5);
}

/** 키워드 모멘텀 계산 (3h vs 24h 비교) */
async function calculateKeywordMomentumMap(pool: Pool): Promise<Map<number, number>> {
  // 3h와 24h keyword_stats를 비교하여 모멘텀 계산
  const { rows: momentumRows } = await pool.query<{
    keyword: string;
    momentum: number;
  }>(`
    SELECT k3.keyword,
      CASE WHEN k24.rate > 0 THEN (k3.rate / k24.rate)::float ELSE 1.0 END AS momentum
    FROM keyword_stats k3
    JOIN keyword_stats k24 ON k24.keyword = k3.keyword AND k24.window_hours = 24
    WHERE k3.window_hours = 3 AND k3.mention_count >= 2
  `);

  const keywordMomentum = new Map<string, number>();
  for (const r of momentumRows) {
    keywordMomentum.set(r.keyword, r.momentum);
  }

  if (keywordMomentum.size === 0) return new Map();

  // 게시글별 최대 모멘텀 매핑
  const { rows: postKeywords } = await pool.query<{
    post_id: number;
    keywords: string[];
  }>(`
    SELECT ke.post_id, ke.keywords
    FROM keyword_extractions ke
    JOIN posts p ON p.id = ke.post_id
    WHERE p.scraped_at > NOW() - INTERVAL '24 hours'
  `);

  const postMomentumMap = new Map<number, number>();
  for (const pk of postKeywords) {
    let maxMomentum = 1.0;
    for (const kw of pk.keywords) {
      const m = keywordMomentum.get(kw);
      if (m !== undefined && m > maxMomentum) maxMomentum = m;
    }
    if (maxMomentum > 1.0) {
      postMomentumMap.set(pk.post_id, maxMomentum);
    }
  }
  return postMomentumMap;
}

/** 키워드 모멘텀 → bonus [1.0, 1.3] */
function momentumToBonus(momentum: number | undefined): number {
  if (!momentum || momentum <= 1.0) return 1.0;
  return 1.0 + Math.min((momentum - 1.0) * 0.15, 0.3);
}

/** 교차검증 트렌드 시그널 → 게시글별 bonus 매핑 */
async function calculateTrendConfirmationMap(pool: Pool): Promise<Map<number, number>> {
  const { rows } = await pool.query<{
    post_id: number;
    max_convergence: number;
  }>(`
    SELECT ke.post_id, MAX(ts.convergence_score)::float AS max_convergence
    FROM keyword_extractions ke
    JOIN posts p ON p.id = ke.post_id
    JOIN trend_signals ts ON ts.keyword = ANY(ke.keywords)
      AND ts.expires_at > NOW()
      AND ts.convergence_score > 5
    WHERE p.scraped_at > NOW() - INTERVAL '24 hours'
    GROUP BY ke.post_id
  `);

  const map = new Map<number, number>();
  for (const r of rows) {
    // convergence_score / 20, 최대 0.25 bonus
    const bonus = 1.0 + Math.min(r.max_convergence / 20.0, 0.25);
    map.set(r.post_id, bonus);
  }
  return map;
}

/** 클러스터 보너스: 로그 곡선 + 소스 다양성 [1.0, 2.5] */
async function calculateClusterBonusMap(pool: Pool): Promise<Map<number, number>> {
  const { rows } = await pool.query<{
    canonical_post_id: number;
    member_count: number;
    category_diversity: number;
  }>(`
    SELECT pc.canonical_post_id, pc.member_count,
      COUNT(DISTINCT p.category)::int AS category_diversity
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
    const diversity = 1.0 + 0.1 * Math.min(r.category_diversity - 1, 3);
    map.set(r.canonical_post_id, Math.min(rawCluster * diversity, 2.5));
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
    velocityMap,
    keywordMomentumMap,
    trendConfirmationMap,
    clusterBonusMap,
    categoryBaselines,
    postsResult,
  ] = await Promise.all([
    calculateSourceStats(pool),
    calculateVelocityMap(pool).catch(() => new Map<number, VelocityData>()),
    calculateKeywordMomentumMap(pool).catch(() => new Map<number, number>()),
    calculateTrendConfirmationMap(pool).catch(() => new Map<number, number>()),
    calculateClusterBonusMap(pool).catch(() => new Map<number, number>()),
    calculateCategoryBaselines(pool),
    pool.query<{
      id: number;
      source_key: string;
      category: string | null;
      view_count: number;
      comment_count: number;
      scraped_at: Date;
    }>(`
      SELECT p.id, p.source_key, p.category, p.view_count, p.comment_count, p.scraped_at
      FROM posts p
      WHERE p.scraped_at > NOW() - INTERVAL '24 hours'
    `),
  ]);

  const rows = postsResult.rows;
  if (rows.length === 0) return 0;

  const now = Date.now();
  const globalBaseline = 2.0; // 카테고리 baseline도 없을 때의 최종 fallback
  const values: string[] = [];
  const params: unknown[] = [];

  // 스코어 분포 추적용
  const scores: number[] = [];

  for (const row of rows) {
    const ageMinutes = (now - new Date(row.scraped_at).getTime()) / 60_000;
    const srcW = getSourceWeight(row.source_key);
    const catW = getCategoryWeight(row.category);
    const catBaseline = categoryBaselines.get(row.category ?? 'unknown') ?? globalBaseline;

    // Zero-engagement credibility 가중치
    let credibilityFactor = 0.8;
    if (row.view_count === 0 && row.comment_count === 0) {
      const hasTrendSignal = trendConfirmationMap.has(row.id);
      const hasKeywordMomentum = (keywordMomentumMap.get(row.id) ?? 1.0) > 1.5;
      const hasCluster = clusterBonusMap.has(row.id);
      if (hasTrendSignal) credibilityFactor = 1.3;
      else if (hasKeywordMomentum) credibilityFactor = 1.2;
      else if (hasCluster) credibilityFactor = 1.15;
    }

    const factors: ScoreFactors = {
      normalizedEngagement: normalizeEngagement(
        row.view_count, row.comment_count, row.source_key,
        sourceStatsMap, catBaseline * credibilityFactor,
      ),
      decay: Math.exp(-LN2 * ageMinutes / HALF_LIFE_MINUTES),
      sourceWeight: srcW,
      categoryWeight: catW,
      velocityBonus: velocityToBonus(velocityMap.get(row.id)),
      clusterBonus: clusterBonusMap.get(row.id) ?? 1.0,
      keywordMomentumBonus: momentumToBonus(keywordMomentumMap.get(row.id)),
      trendConfirmationBonus: trendConfirmationMap.get(row.id) ?? 1.0,
    };

    const score = computeScore(factors);
    scores.push(score);

    const i = params.length;
    params.push(row.id, score, srcW, catW);
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

  // 스코어 분포 로깅
  if (scores.length > 0) {
    scores.sort((a, b) => a - b);
    const p = (pct: number) => scores[Math.floor(scores.length * pct / 100)]?.toFixed(2) ?? '?';
    console.log(
      `[scoring] ${scores.length} posts scored. p10=${p(10)}, p50=${p(50)}, p90=${p(90)}, max=${scores[scores.length - 1]?.toFixed(2)}`
    );
  }

  return updated;
}
