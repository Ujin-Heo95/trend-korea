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
import type { V8Channel, V8Post, V8IssueCard } from './types.js';
import { clusterPosts } from './postClustering.js';
import { computeCrossChannelEcho } from './crossChannelEcho.js';
import { computeUnifiedScores } from './unifiedScoring.js';
import { rankIssues } from './issueRanker.js';

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

async function persistIssueRankings(
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
    await client.query('DELETE FROM issue_rankings');

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

      await client.query(
        `INSERT INTO issue_rankings (
           title, summary, category_label, issue_score,
           news_score, community_score, trend_signal_score, video_score,
           news_post_count, community_post_count, video_post_count,
           representative_thumbnail, cluster_ids, standalone_post_ids,
           calculated_at, expires_at, stable_id, cross_validation_score, cross_validation_sources
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          card.title,
          // summary fallback = title: materializeIssueResponse 는 summary IS NOT NULL 필터를
          // 쓰므로 v8 첫 tick 에 gemini 가 아직 돌지 않았어도 카드가 사용자에게 노출되도록 보장.
          // Gemini 요약이 :05 tick 에서 이 칼럼을 덮어쓴다.
          card.title,
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

export interface V8PipelineResult {
  readonly postsLoaded: number;
  readonly embeddingsGenerated: number;
  readonly clustersFormed: number;
  readonly issuesPersisted: number;
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
    return { postsLoaded: 0, embeddingsGenerated: 0, clustersFormed: 0, issuesPersisted: 0, durationMs: Date.now() - start };
  }

  const embeddingsGenerated = await ensureEmbeddings(posts);
  logger.info({ generated: embeddingsGenerated }, '[v8] embeddings ensured');

  const weights = await preloadWeights();

  const clusterStart = Date.now();
  const clusters = clusterPosts(posts);
  const clusterMs = Date.now() - clusterStart;
  logger.info({ count: clusters.length, ms: clusterMs }, '[v8] clusters formed');

  const echo = computeCrossChannelEcho(posts, weights);

  const { scores } = computeUnifiedScores({ posts, weights, echo, clusters, now: calculatedAt });

  const cards = rankIssues({ clusters, scores, posts });
  logger.info({ count: cards.length }, '[v8] issue cards ranked');

  await persistIssueRankings(pool, cards, calculatedAt);

  return {
    postsLoaded: posts.length,
    embeddingsGenerated,
    clustersFormed: clusters.length,
    issuesPersisted: cards.length,
    durationMs: Date.now() - start,
  };
}
