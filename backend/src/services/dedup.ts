import { createHash } from 'crypto';
import type { Pool } from 'pg';
import type { ScrapedPost } from '../scrapers/types.js';
import { logger } from '../utils/logger.js';
import { cosineSimilarity } from './embedding.js';

const JACCARD_THRESHOLD = 0.8;
const WORD_JACCARD_THRESHOLD = 0.65;
const EMBEDDING_COSINE_THRESHOLD = 0.85;
const MIN_TITLE_LENGTH_FOR_L2 = 8;
const WINDOW_HOURS = 6;

// ─── Korean Tokenizer ───

/** 한국어 조사/어미 — 긴 것부터 매칭해야 '에서'가 '에' 전에 시도됨 */
const PARTICLES = [
  '에서는', '으로서', '으로는', '에서도', '으로도',
  '에서', '으로', '에게', '까지', '부터', '라는', '이라',
  '처럼', '만큼', '에는', '에도', '와는', '과는',
  '은', '는', '이', '가', '을', '를', '에', '의',
  '도', '와', '과', '로', '며', '면', '고', '한',
  '된', '할', '들',
] as const;

/** 고빈도 무의미 단어 (IDF 가중 전에도 기본 제거) */
const STOP_WORDS = new Set([
  '관련', '대한', '이번', '통해', '위해', '따르면', '대해',
  '오늘', '내일', '어제', '현재', '최근', '사실',
  '것으로', '것이', '하는', '있는', '없는', '되는',
  '그리고', '하지만', '그러나', '또한', '그래서',
]);

/**
 * 경량 한국어 토크나이저: 공백 분리 → 조사/어미 제거 → 불용어 필터.
 * 네이버의 형태소 분석을 대체하는 룰 기반 접근.
 */
export function koreanTokenize(text: string): Set<string> {
  const normalized = normalizeTitle(text);
  const tokens = new Set<string>();

  for (const word of normalized.split(' ')) {
    if (word.length === 0) continue;

    let stem = word;
    // 가장 긴 매칭 파티클부터 제거 (1회만)
    let stripped = false;
    for (const p of PARTICLES) {
      if (stem.length > p.length && stem.endsWith(p)) {
        stem = stem.slice(0, -p.length);
        stripped = true;
        break;
      }
    }

    // 조사 제거로 1글자 됐으면 원본 복원 ("통과"→"통" 방지)
    if (stem.length <= 1 && stripped) {
      stem = word;
    }

    // 1글자 토큰, 불용어, 순수 숫자 제거
    if (stem.length <= 1) continue;
    if (STOP_WORDS.has(stem)) continue;
    if (/^\d+$/.test(stem)) continue;

    tokens.add(stem);
  }

  return tokens;
}

/** 단어 수준 Jaccard 유사도 (어순 무관) */
export function wordJaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Strip bracket expressions, special chars, collapse whitespace, lowercase, trim.
 *  Must produce identical output to the PostgreSQL GENERATED column expression. */
export function normalizeTitle(title: string): string {
  return title
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function titleHash(title: string): string {
  return createHash('md5').update(normalizeTitle(title)).digest('hex');
}

export function bigrams(text: string): Set<string> {
  const normalized = normalizeTitle(text);
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface PostRow {
  id: number;
  title: string;
  title_hash: string;
  category: string | null;
  thumbnail: string | null;
  view_count: number;
  scraped_at: Date;
}

interface PostRowWithUrl extends PostRow {
  url: string;
}

interface MatchResult {
  postId: number;
  score: number;
  layer: 'L1' | 'L2' | 'L3';
}

/** Pre-fetched data passed into per-post clustering to avoid individual queries. */
interface BatchContext {
  /** Map from URL to PostRow (batch-fetched post rows for the current batch). */
  readonly postsByUrl: ReadonlyMap<string, PostRowWithUrl>;
  /** Set of post IDs already in a cluster. */
  readonly clusteredPostIds: ReadonlySet<number>;
  /** Map from cluster member post_id to cluster_id. */
  readonly membershipByPostId: ReadonlyMap<number, number>;
  /** All recent posts within the time window for matching. */
  readonly recentPosts: readonly PostRow[];
  /** Recent posts grouped by title_hash for L1 lookup. */
  readonly recentByHash: ReadonlyMap<string, readonly PostRow[]>;
  /** Recent posts grouped by thumbnail for L3 lookup. */
  readonly recentByThumb: ReadonlyMap<string, readonly PostRow[]>;
  /** Recent posts grouped by category for L2 lookup. */
  readonly recentByCategory: ReadonlyMap<string, readonly PostRow[]>;
}

export async function clusterPosts(pool: Pool, posts: readonly ScrapedPost[]): Promise<void> {
  if (posts.length === 0) return;

  const ctx = await buildBatchContext(pool, posts);

  for (const post of posts) {
    try {
      await clusterOnePostBatch(pool, post, ctx);
    } catch (err) {
      logger.warn({ err, url: post.url }, '[dedup] cluster error');
    }
  }
}

/** Batch pre-fetch all data needed for clustering, reducing N*4-8 queries to 3. */
async function buildBatchContext(
  pool: Pool,
  posts: readonly ScrapedPost[],
): Promise<BatchContext> {
  const urls = posts.map(p => p.url);

  // 1) Batch fetch post rows by URL
  // 2) Batch fetch recent posts within time window
  // Run both in parallel
  const [postRowsResult, recentResult] = await Promise.all([
    pool.query<PostRowWithUrl>(
      `SELECT id, title, title_hash, category, thumbnail, view_count, scraped_at, url
       FROM posts WHERE url = ANY($1::text[])`,
      [urls],
    ),
    pool.query<PostRow>(
      `SELECT id, title, title_hash, category, thumbnail, view_count, scraped_at
       FROM posts WHERE scraped_at > NOW() - $1 * INTERVAL '1 hour'`,
      [WINDOW_HOURS],
    ),
  ]);

  const postsByUrl = new Map<string, PostRowWithUrl>();
  for (const row of postRowsResult.rows) {
    postsByUrl.set(row.url, row);
  }

  // Collect all post IDs we need membership info for
  const batchPostIds = postRowsResult.rows.map(r => r.id);
  const recentPostIds = recentResult.rows.map(r => r.id);
  const allRelevantIds = [...new Set([...batchPostIds, ...recentPostIds])];

  // 3) Batch fetch cluster memberships for all relevant posts
  const membershipResult = allRelevantIds.length > 0
    ? await pool.query<{ post_id: number; cluster_id: number }>(
        `SELECT post_id, cluster_id FROM post_cluster_members WHERE post_id = ANY($1::int[])`,
        [allRelevantIds],
      )
    : { rows: [] };

  const clusteredPostIds = new Set<number>();
  const membershipByPostId = new Map<number, number>();
  for (const row of membershipResult.rows) {
    clusteredPostIds.add(row.post_id);
    membershipByPostId.set(row.post_id, row.cluster_id);
  }

  // Index recent posts by title_hash, thumbnail, category
  const recentByHash = new Map<string, PostRow[]>();
  const recentByThumb = new Map<string, PostRow[]>();
  const recentByCategory = new Map<string, PostRow[]>();

  for (const row of recentResult.rows) {
    // By title_hash
    const hashGroup = recentByHash.get(row.title_hash);
    if (hashGroup) {
      hashGroup.push(row);
    } else {
      recentByHash.set(row.title_hash, [row]);
    }

    // By thumbnail
    if (row.thumbnail) {
      const thumbGroup = recentByThumb.get(row.thumbnail);
      if (thumbGroup) {
        thumbGroup.push(row);
      } else {
        recentByThumb.set(row.thumbnail, [row]);
      }
    }

    // By category
    if (row.category) {
      const catGroup = recentByCategory.get(row.category);
      if (catGroup) {
        catGroup.push(row);
      } else {
        recentByCategory.set(row.category, [row]);
      }
    }
  }

  return {
    postsByUrl,
    clusteredPostIds,
    membershipByPostId,
    recentPosts: recentResult.rows,
    recentByHash,
    recentByThumb,
    recentByCategory,
  };
}

/** Cluster a single post using pre-fetched batch context. Only writes need DB queries. */
async function clusterOnePostBatch(
  pool: Pool,
  post: ScrapedPost,
  ctx: BatchContext,
): Promise<void> {
  // Look up post row from pre-fetched data
  const row = ctx.postsByUrl.get(post.url);
  if (!row) return;

  // Already in a cluster? (pre-fetched membership check)
  if (ctx.clusteredPostIds.has(row.id)) return;

  const matches: MatchResult[] = [];
  const matchedIds = new Set<number>();

  // L1: Exact title_hash match (in-memory lookup)
  const hashMatches = ctx.recentByHash.get(row.title_hash) ?? [];
  for (const m of hashMatches) {
    if (m.id !== row.id) {
      matches.push({ postId: m.id, score: 1.0, layer: 'L1' });
      matchedIds.add(m.id);
    }
  }

  // L3: Thumbnail URL match (in-memory lookup)
  if (row.thumbnail) {
    const thumbMatches = ctx.recentByThumb.get(row.thumbnail) ?? [];
    for (const m of thumbMatches) {
      if (m.id !== row.id && !matchedIds.has(m.id)) {
        matches.push({ postId: m.id, score: 1.0, layer: 'L3' });
        matchedIds.add(m.id);
      }
    }
  }

  // L2: Hybrid matching — bigram Jaccard OR word Jaccard (same category, in-memory)
  const normalized = normalizeTitle(row.title);
  if (normalized.length >= MIN_TITLE_LENGTH_FOR_L2 && row.category) {
    const candidates = ctx.recentByCategory.get(row.category) ?? [];
    const postBigrams = bigrams(row.title);
    const postWords = koreanTokenize(row.title);
    for (const c of candidates) {
      if (c.id !== row.id && !matchedIds.has(c.id)) {
        const bigramSim = jaccardSimilarity(postBigrams, bigrams(c.title));
        if (bigramSim >= JACCARD_THRESHOLD) {
          matches.push({ postId: c.id, score: bigramSim, layer: 'L2' });
          matchedIds.add(c.id);
        } else if (postWords.size >= 2) {
          // 바이그램 미달이면 단어 수준 Jaccard 시도 (어순/조사 차이 보완)
          const wordSim = wordJaccardSimilarity(postWords, koreanTokenize(c.title));
          if (wordSim >= WORD_JACCARD_THRESHOLD) {
            matches.push({ postId: c.id, score: wordSim, layer: 'L2' });
            matchedIds.add(c.id);
          } else {
            // 최종 폴백: Gemini 임베딩 코사인 유사도 (의미적 유사도)
            const embSim = cosineSimilarity(row.id, c.id);
            if (embSim !== null && embSim >= EMBEDDING_COSINE_THRESHOLD) {
              matches.push({ postId: c.id, score: embSim, layer: 'L2' });
              matchedIds.add(c.id);
            }
          }
        }
      }
    }
  }

  if (matches.length === 0) return;

  // Check if any matched post is already in a cluster (in-memory lookup)
  const existingClusterIds = new Set<number>();
  for (const id of matchedIds) {
    const clusterId = ctx.membershipByPostId.get(id);
    if (clusterId !== undefined) {
      existingClusterIds.add(clusterId);
    }
  }

  if (existingClusterIds.size > 0) {
    // Join existing cluster (pick first)
    const clusterId = existingClusterIds.values().next().value as number;
    const bestMatch = matches.reduce((a, b) => a.score > b.score ? a : b);
    await pool.query(
      `INSERT INTO post_cluster_members (cluster_id, post_id, similarity_score, match_layer)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cluster_id, post_id) DO NOTHING`,
      [clusterId, row.id, bestMatch.score, bestMatch.layer],
    );
    // Update member_count and canonical (pick highest view_count)
    await pool.query(
      `UPDATE post_clusters SET
         member_count = (SELECT COUNT(*) FROM post_cluster_members WHERE cluster_id = $1),
         canonical_post_id = (
           SELECT pcm.post_id FROM post_cluster_members pcm
           JOIN posts p ON p.id = pcm.post_id
           WHERE pcm.cluster_id = $1
           ORDER BY p.view_count DESC NULLS LAST, p.scraped_at DESC
           LIMIT 1
         )
       WHERE id = $1`,
      [clusterId],
    );
  } else {
    // Create new cluster
    const allPostIds = [row.id, ...matches.map(m => m.postId)];
    // Find canonical: highest view_count (in-memory from recent posts + current row)
    const allRows = [row as PostRow, ...matches.map(m => {
      const found = ctx.recentPosts.find(r => r.id === m.postId);
      return found;
    }).filter((r): r is PostRow => r !== undefined)];
    const canonical = allRows.sort((a, b) => {
      const viewDiff = (b.view_count ?? 0) - (a.view_count ?? 0);
      if (viewDiff !== 0) return viewDiff;
      return new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime();
    })[0];
    const canonicalId = canonical?.id ?? row.id;

    const { rows: [cluster] } = await pool.query<{ id: number }>(
      `INSERT INTO post_clusters (canonical_post_id, member_count)
       VALUES ($1, $2) RETURNING id`,
      [canonicalId, allPostIds.length],
    );
    // Batch insert all members in a single query
    const values: string[] = [];
    const params: unknown[] = [cluster.id];
    let paramIdx = 2;
    for (const postId of allPostIds) {
      const match = matches.find(m => m.postId === postId);
      values.push(`($1, $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2})`);
      params.push(postId, match?.score ?? 1.0, match?.layer ?? 'L1');
      paramIdx += 3;
    }
    await pool.query(
      `INSERT INTO post_cluster_members (cluster_id, post_id, similarity_score, match_layer)
       VALUES ${values.join(', ')}
       ON CONFLICT (cluster_id, post_id) DO NOTHING`,
      params,
    );
  }
}
