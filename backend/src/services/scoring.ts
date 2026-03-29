import type { Pool } from 'pg';

const LN2 = Math.LN2;
const HALF_LIFE_MINUTES = 360; // 6시간 반감기

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

/** Core scoring formula from 콘텐츠-랭킹.md §1.1 */
export function computeScore(
  viewCount: number,
  commentCount: number,
  ageMinutes: number,
  sourceWeight: number,
  categoryWeight: number,
  clusterBonus: number = 1.0,
): number {
  const rawEngagement = Math.log1p(viewCount) + Math.log1p(commentCount) * 1.5;
  // Baseline: 조회수/댓글수 모두 없는 글도 recency × sourceWeight로 순위 결정
  const engagement = rawEngagement > 0 ? rawEngagement : 2.0;
  const decay = Math.exp(-LN2 * ageMinutes / HALF_LIFE_MINUTES);
  return engagement * decay * sourceWeight * categoryWeight * clusterBonus;
}

/** Batch-calculate scores for all posts in the last 24 hours */
export async function calculateScores(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{
    id: number;
    source_key: string;
    category: string | null;
    view_count: number;
    comment_count: number;
    scraped_at: Date;
    member_count: number | null;
  }>(`
    SELECT p.id, p.source_key, p.category, p.view_count, p.comment_count, p.scraped_at,
           pc.member_count
    FROM posts p
    LEFT JOIN post_clusters pc ON pc.canonical_post_id = p.id
    WHERE p.scraped_at > NOW() - INTERVAL '24 hours'
  `);

  if (rows.length === 0) return 0;

  const now = Date.now();
  const values: string[] = [];
  const params: unknown[] = [];

  for (const row of rows) {
    const ageMinutes = (now - new Date(row.scraped_at).getTime()) / 60_000;
    const srcW = getSourceWeight(row.source_key);
    const catW = getCategoryWeight(row.category);
    const clusterBonus = row.member_count
      ? Math.min(1.0 + 0.1 * (row.member_count - 1), 1.5)
      : 1.0;
    const score = computeScore(row.view_count, row.comment_count, ageMinutes, srcW, catW, clusterBonus);

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

  return updated;
}
