/**
 * v8 Pipeline Orchestrator — 4개 v8 모듈을 묶어 실제 DB I/O 와 연결.
 *
 *   loadPosts → ensureEmbeddings → cluster → echo → unifiedScore → rankIssues → persist
 *
 * 기존 `issue_rankings` 스키마 재사용 (news_score/community_score/video_score 컬럼에 v8 산출값 매핑).
 * scoring_v8_enabled 플래그 OFF 상태에서 스케줄러에 추가되며, ON 시 기존 경로 차단.
 */

import type { Pool } from 'pg';
import { logger } from '../../utils/logger.js';
import { SCORED_CATEGORIES_SQL, getChannel, preloadWeights } from '../scoring-weights.js';
import { generateEmbeddings, getEmbedding } from '../embedding.js';
import type { V8Channel, V8Post, V8IssueCard, V8PostScore } from './types.js';
import { clusterPosts } from './postClustering.js';
import { computeCrossChannelEcho } from './crossChannelEcho.js';
import { computeUnifiedScores } from './unifiedScoring.js';
import { rankIssues } from './issueRanker.js';
import { loadTokenStatsSnapshot, makeShareHighIdfGate } from '../tokenStats.js';

const V8_TIME_WINDOW_HOURS = 12;
const V8_MAX_POSTS = 3000;

interface DbPostRow {
  id: number;
  title: string;
  url: string;
  source_key: string;
  category: string | null;
  scraped_at: Date;
  published_at: Date | null;
  view_count: number;
  comment_count: number;
  like_count: number;
  thumbnail: string | null;
}

function toV8Channel(category: string | null): V8Channel | null {
  // SCORED_CATEGORIES = news|community|video|portal 이 곧 v8 채널
  if (category === 'news' || category === 'community' || category === 'video' || category === 'portal') {
    return category;
  }
  // getChannel 은 community/news/video/sns/specialized 를 반환. v8 은 portal 을 news 와 분리.
  const ch = getChannel(category);
  if (ch === 'community' || ch === 'news' || ch === 'video') return ch;
  return null;
}

async function loadPostsForV8(pool: Pool): Promise<V8Post[]> {
  const { rows } = await pool.query<DbPostRow>(
    `SELECT id, title, url, source_key, category, scraped_at, published_at,
            view_count, comment_count, like_count, thumbnail
     FROM posts
     WHERE scraped_at > NOW() - INTERVAL '${V8_TIME_WINDOW_HOURS} hours'
       AND COALESCE(category, '') IN ${SCORED_CATEGORIES_SQL}
     ORDER BY scraped_at DESC
     LIMIT $1`,
    [V8_MAX_POSTS],
  );

  const posts: V8Post[] = [];
  for (const r of rows) {
    const channel = toV8Channel(r.category);
    if (!channel) continue;
    posts.push({
      id: r.id,
      title: r.title,
      url: r.url,
      sourceKey: r.source_key,
      category: r.category,
      channel,
      scrapedAt: r.scraped_at,
      publishedAt: r.published_at,
      viewCount: r.view_count ?? 0,
      commentCount: r.comment_count ?? 0,
      likeCount: r.like_count ?? 0,
      thumbnailUrl: r.thumbnail,
    });
  }
  return posts;
}

async function ensureEmbeddings(posts: readonly V8Post[]): Promise<number> {
  // 캐시에 없는 포스트만 generateEmbeddings 가 자체 필터링
  const missing = posts.filter(p => !getEmbedding(p.id));
  if (missing.length === 0) return 0;
  return generateEmbeddings(missing.map(p => ({ id: p.id, title: p.title })));
}

function toLegacyCategoryLabel(card: V8IssueCard): string {
  return card.category;
}

export async function persistIssueRankings(
  pool: Pool,
  cards: readonly V8IssueCard[],
  calculatedAt: Date,
): Promise<void> {
  if (cards.length === 0) {
    logger.warn('[v8] 0 issue cards to persist — skipping delete/insert');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // stale_id 가 현재 cards 에 속하지 않는 기존 행 + legacy NULL stable_id 행 정리.
    // Gemini 요약이 들어간 현행 카드는 UPSERT 에서 summary 를 보존한다.
    const currentStableIds = cards.map(c => c.clusterId);
    await client.query(
      `DELETE FROM issue_rankings
         WHERE stable_id IS NULL
            OR NOT (stable_id = ANY($1::text[]))`,
      [currentStableIds],
    );

    for (const card of cards) {
      const bd = card.cluster.channelBreakdown;
      const newsScore = card.topPosts
        .filter(p => p.channel === 'news' || p.channel === 'portal')
        .reduce((s, p) => s + p.normalizedScore, 0);
      const communityScore = card.topPosts
        .filter(p => p.channel === 'community')
        .reduce((s, p) => s + p.normalizedScore, 0);
      const videoScore = card.topPosts
        .filter(p => p.channel === 'video')
        .reduce((s, p) => s + p.normalizedScore, 0);

      // seed summary 는 '[fallback] …' prefix — isStaleSummary() 가 stale 로 판정하여
      // 다음 Gemini tick 의 targets 에 포함된다. Gemini 가 실제 요약을 쓰면
      // ON CONFLICT 분기에서 AI-owned 필드(title/summary/category_label/quality/keywords/sentiment)
      // 가 보존되고, pipeline-owned 필드(점수·thumbnail·member·expires 등)만 갱신된다.
      const seedSummary = `[fallback] ${card.title}`;

      await client.query(
        `INSERT INTO issue_rankings (
           title, summary, category_label, issue_score,
           news_score, community_score, trend_signal_score, video_score,
           news_post_count, community_post_count, video_post_count,
           representative_thumbnail, cluster_ids, standalone_post_ids,
           calculated_at, expires_at, stable_id, cross_validation_score, cross_validation_sources
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (stable_id, window_hours) WHERE stable_id IS NOT NULL DO UPDATE SET
           title          = CASE WHEN issue_rankings.summary IS NULL OR issue_rankings.summary LIKE '[fallback]%'
                                 THEN EXCLUDED.title ELSE issue_rankings.title END,
           summary        = CASE WHEN issue_rankings.summary IS NULL OR issue_rankings.summary LIKE '[fallback]%'
                                 THEN EXCLUDED.summary ELSE issue_rankings.summary END,
           category_label = CASE WHEN issue_rankings.summary IS NULL OR issue_rankings.summary LIKE '[fallback]%'
                                 THEN EXCLUDED.category_label ELSE issue_rankings.category_label END,
           issue_score              = EXCLUDED.issue_score,
           news_score               = EXCLUDED.news_score,
           community_score          = EXCLUDED.community_score,
           trend_signal_score       = EXCLUDED.trend_signal_score,
           video_score              = EXCLUDED.video_score,
           news_post_count          = EXCLUDED.news_post_count,
           community_post_count     = EXCLUDED.community_post_count,
           video_post_count         = EXCLUDED.video_post_count,
           representative_thumbnail = EXCLUDED.representative_thumbnail,
           cluster_ids              = EXCLUDED.cluster_ids,
           standalone_post_ids      = EXCLUDED.standalone_post_ids,
           calculated_at            = EXCLUDED.calculated_at,
           expires_at               = EXCLUDED.expires_at,
           cross_validation_score   = EXCLUDED.cross_validation_score,
           cross_validation_sources = EXCLUDED.cross_validation_sources`,
        [
          card.title,
          seedSummary,
          toLegacyCategoryLabel(card),
          card.issueScore,
          newsScore,
          communityScore,
          0, // trend_signal_score 폐기 → 0
          videoScore,
          bd.news + bd.portal,
          bd.community,
          bd.video,
          card.thumbnail,
          [], // v8 cluster_ids 없음
          card.cluster.memberPostIds,
          calculatedAt,
          new Date(calculatedAt.getTime() + 6 * 60 * 60 * 1000),
          card.clusterId,
          0, // cross_validation_score 폐기
          [],
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const POST_SCORES_BATCH_SIZE = 500;

/**
 * v8 unifiedScore(normalizedScore) → post_scores.trend_score 역기록.
 *
 * 종합 탭 이슈카드(v8)와 카테고리 탭 인기순(/api/posts?sort=trending,
 * post_scores.trend_score 기준)이 동일한 ordering 을 갖도록 한다.
 * legacy scoring batch 는 1424a11 에서 제거되었으므로 v8 가 단일 source-of-truth.
 */
export async function persistPostScoresFromV8(
  pool: Pool,
  scores: readonly V8PostScore[],
  calculatedAt: Date,
): Promise<number> {
  if (scores.length === 0) return 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let upserted = 0;
    for (let i = 0; i < scores.length; i += POST_SCORES_BATCH_SIZE) {
      const chunk = scores.slice(i, i + POST_SCORES_BATCH_SIZE);
      const values: string[] = [];
      const params: unknown[] = [];
      for (const s of chunk) {
        const base = params.length;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        params.push(s.postId, s.normalizedScore, calculatedAt);
      }
      await client.query(
        `INSERT INTO post_scores (post_id, trend_score, calculated_at)
         VALUES ${values.join(', ')}
         ON CONFLICT (post_id) DO UPDATE
           SET trend_score = EXCLUDED.trend_score,
               calculated_at = EXCLUDED.calculated_at`,
        params,
      );
      upserted += chunk.length;
    }
    await client.query('COMMIT');
    return upserted;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface V8PipelineResult {
  readonly postsLoaded: number;
  readonly embeddingsGenerated: number;
  readonly clustersFormed: number;
  readonly issuesPersisted: number;
  readonly postScoresUpserted: number;
  readonly durationMs: number;
}

/**
 * v8 파이프라인 1 tick 을 실행. 스케줄러에서 flag 가 ON 일 때 호출.
 */
export async function runV8Pipeline(pool: Pool): Promise<V8PipelineResult> {
  const start = Date.now();
  const calculatedAt = new Date();

  const posts = await loadPostsForV8(pool);
  logger.info({ count: posts.length }, '[v8] posts loaded');
  if (posts.length === 0) {
    return { postsLoaded: 0, embeddingsGenerated: 0, clustersFormed: 0, issuesPersisted: 0, postScoresUpserted: 0, durationMs: Date.now() - start };
  }

  const embeddingsGenerated = await ensureEmbeddings(posts);
  logger.info({ generated: embeddingsGenerated }, '[v8] embeddings ensured');

  const weights = await preloadWeights();

  // High-IDF 토큰 게이트: 일반명사("집/아파트/주택") 단독 brigde 차단.
  // snapshot 이 비어있으면 (cold start / 첫 부팅) 게이트는 자동 bypass.
  const tokenSnapshot = await loadTokenStatsSnapshot(pool);
  const idfGate = makeShareHighIdfGate(tokenSnapshot);
  logger.info(
    { tokenCount: tokenSnapshot.stats.size, n24h: tokenSnapshot.docCount24h, nBaseline: tokenSnapshot.docCountBaseline },
    '[v8] token-stats snapshot loaded',
  );

  const clusterStart = Date.now();
  const clusters = clusterPosts(posts, undefined, idfGate);
  const clusterMs = Date.now() - clusterStart;
  logger.info({ count: clusters.length, ms: clusterMs }, '[v8] clusters formed');

  const echo = computeCrossChannelEcho(posts, weights);

  const { scores } = computeUnifiedScores({ posts, weights, echo, clusters, now: calculatedAt });

  const cards = rankIssues({ clusters, scores, posts });
  logger.info({ count: cards.length }, '[v8] issue cards ranked');

  await persistIssueRankings(pool, cards, calculatedAt);

  const postScoresUpserted = await persistPostScoresFromV8(pool, scores, calculatedAt);
  logger.info({ count: postScoresUpserted }, '[v8] post_scores upserted');

  return {
    postsLoaded: posts.length,
    embeddingsGenerated,
    clustersFormed: clusters.length,
    issuesPersisted: cards.length,
    postScoresUpserted,
    durationMs: Date.now() - start,
  };
}
