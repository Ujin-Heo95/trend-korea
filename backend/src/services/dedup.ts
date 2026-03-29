import { createHash } from 'crypto';
import type { Pool } from 'pg';
import type { ScrapedPost } from '../scrapers/types.js';

const JACCARD_THRESHOLD = 0.8;
const MIN_TITLE_LENGTH_FOR_L2 = 8;
const WINDOW_HOURS = 6;

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

interface MatchResult {
  postId: number;
  score: number;
  layer: 'L1' | 'L2' | 'L3';
}

export async function clusterPosts(pool: Pool, posts: readonly ScrapedPost[]): Promise<void> {
  for (const post of posts) {
    try {
      await clusterOnePost(pool, post);
    } catch (err) {
      console.warn(`[dedup] cluster error for ${post.url}: ${String(err)}`);
    }
  }
}

async function clusterOnePost(pool: Pool, post: ScrapedPost): Promise<void> {
  // Fetch the row we just inserted (may not exist if ON CONFLICT skipped it)
  const { rows: [row] } = await pool.query<PostRow>(
    `SELECT id, title, title_hash, category, thumbnail, view_count, scraped_at
     FROM posts WHERE url = $1`,
    [post.url]
  );
  if (!row) return;

  // Already in a cluster?
  const { rows: existing } = await pool.query(
    `SELECT cluster_id FROM post_cluster_members WHERE post_id = $1`,
    [row.id]
  );
  if (existing.length > 0) return;

  const matches: MatchResult[] = [];
  const matchedIds = new Set<number>();

  // L1: Exact title_hash match
  const { rows: hashMatches } = await pool.query<PostRow>(
    `SELECT id, title, view_count, scraped_at FROM posts
     WHERE title_hash = $1 AND id != $2
       AND scraped_at > NOW() - INTERVAL '${WINDOW_HOURS} hours'`,
    [row.title_hash, row.id]
  );
  for (const m of hashMatches) {
    matches.push({ postId: m.id, score: 1.0, layer: 'L1' });
    matchedIds.add(m.id);
  }

  // L3: Thumbnail URL match
  if (row.thumbnail) {
    const { rows: thumbMatches } = await pool.query<PostRow>(
      `SELECT id, title, view_count, scraped_at FROM posts
       WHERE thumbnail = $1 AND id != $2
         AND scraped_at > NOW() - INTERVAL '${WINDOW_HOURS} hours'`,
      [row.thumbnail, row.id]
    );
    for (const m of thumbMatches) {
      if (!matchedIds.has(m.id)) {
        matches.push({ postId: m.id, score: 1.0, layer: 'L3' });
        matchedIds.add(m.id);
      }
    }
  }

  // L2: 2-gram Jaccard (same category, skip if title too short)
  const normalized = normalizeTitle(row.title);
  if (normalized.length >= MIN_TITLE_LENGTH_FOR_L2 && row.category) {
    const { rows: candidates } = await pool.query<PostRow>(
      `SELECT id, title, view_count, scraped_at FROM posts
       WHERE category = $1 AND id != $2
         AND scraped_at > NOW() - INTERVAL '${WINDOW_HOURS} hours'
         AND id != ALL($3::int[])`,
      [row.category, row.id, Array.from(matchedIds)]
    );
    const postBigrams = bigrams(row.title);
    for (const c of candidates) {
      const sim = jaccardSimilarity(postBigrams, bigrams(c.title));
      if (sim >= JACCARD_THRESHOLD) {
        matches.push({ postId: c.id, score: sim, layer: 'L2' });
        matchedIds.add(c.id);
      }
    }
  }

  if (matches.length === 0) return;

  // Check if any matched post is already in a cluster
  const { rows: existingClusters } = await pool.query<{ cluster_id: number }>(
    `SELECT DISTINCT cluster_id FROM post_cluster_members
     WHERE post_id = ANY($1::int[])`,
    [Array.from(matchedIds)]
  );

  if (existingClusters.length > 0) {
    // Join existing cluster
    const clusterId = existingClusters[0].cluster_id;
    const bestMatch = matches.reduce((a, b) => a.score > b.score ? a : b);
    await pool.query(
      `INSERT INTO post_cluster_members (cluster_id, post_id, similarity_score, match_layer)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cluster_id, post_id) DO NOTHING`,
      [clusterId, row.id, bestMatch.score, bestMatch.layer]
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
      [clusterId]
    );
  } else {
    // Create new cluster
    const allPostIds = [row.id, ...matches.map(m => m.postId)];
    // Find canonical: highest view_count
    const { rows: [canonical] } = await pool.query<{ id: number }>(
      `SELECT id FROM posts WHERE id = ANY($1::int[])
       ORDER BY view_count DESC NULLS LAST, scraped_at DESC LIMIT 1`,
      [allPostIds]
    );
    const { rows: [cluster] } = await pool.query<{ id: number }>(
      `INSERT INTO post_clusters (canonical_post_id, member_count)
       VALUES ($1, $2) RETURNING id`,
      [canonical.id, allPostIds.length]
    );
    // Insert all members
    for (const postId of allPostIds) {
      const match = matches.find(m => m.postId === postId);
      await pool.query(
        `INSERT INTO post_cluster_members (cluster_id, post_id, similarity_score, match_layer)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cluster_id, post_id) DO NOTHING`,
        [cluster.id, postId, match?.score ?? 1.0, match?.layer ?? 'L1']
      );
    }
  }
}
