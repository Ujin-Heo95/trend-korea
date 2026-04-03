import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

const detailCache = new LRUCache<unknown>(200, 60_000);

export async function issueDetailRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { postId: string } }>('/api/posts/:postId', async (req, reply) => {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) return reply.status(400).send({ error: 'Invalid post ID' });

    const cacheKey = `issue-detail:${postId}`;
    const cached = detailCache.get(cacheKey);
    if (cached) return cached;

    // Q1-Q4 in parallel
    const [postResult, clusterResult, keywordsResult, engagementResult] = await Promise.all([
      // Q1: Post + trend_score
      app.pg.query<{
        id: number; source_key: string; source_name: string; title: string; url: string;
        thumbnail: string | null; author: string | null; view_count: number; comment_count: number;
        published_at: string | null; scraped_at: string; category: string | null;
        metadata: Record<string, unknown> | null; trend_score: number | null;
      }>(
        `SELECT p.id, p.source_key, p.source_name, p.title, p.url, p.thumbnail,
                p.author, p.view_count, p.comment_count, p.vote_count, p.published_at, p.scraped_at,
                p.category, p.metadata, p.ai_summary, ps.trend_score
         FROM posts p
         LEFT JOIN post_scores ps ON ps.post_id = p.id
         WHERE p.id = $1`,
        [postId]
      ),

      // Q2: Cluster members
      app.pg.query<{
        id: number; source_key: string; source_name: string; title: string; url: string;
        view_count: number; comment_count: number; published_at: string | null;
      }>(
        `SELECT p.id, p.source_key, p.source_name, p.title, p.url,
                p.view_count, p.comment_count, p.published_at
         FROM post_cluster_members pcm
         JOIN posts p ON p.id = pcm.post_id
         WHERE pcm.cluster_id = (
           SELECT cluster_id FROM post_cluster_members WHERE post_id = $1 LIMIT 1
         ) AND pcm.post_id != $1
         ORDER BY p.view_count DESC`,
        [postId]
      ),

      // Q3: Keywords for this post
      app.pg.query<{ keywords: string[] }>(
        `SELECT keywords FROM keyword_extractions WHERE post_id = $1`,
        [postId]
      ),

      // Q4: Engagement snapshots
      app.pg.query<{ view_count: number; comment_count: number; captured_at: string }>(
        `SELECT view_count, comment_count, captured_at
         FROM engagement_snapshots WHERE post_id = $1
         ORDER BY captured_at LIMIT 20`,
        [postId]
      ),
    ]);

    const post = postResult.rows[0];
    if (!post) return reply.status(404).send({ error: 'Post not found' });

    const { trend_score, ...postData } = post;

    // Q5: Trend signals matching extracted keywords
    const keywords = keywordsResult.rows[0]?.keywords ?? [];
    let trendSignals: {
      id: number; keyword: string; google_traffic: string | null;
      naver_change_pct: number | null;
      naver_trend_data: { period: string; ratio: number }[] | null;
      convergence_score: number; signal_type: string;
      google_post_id: number | null; related_post_ids: number[];
    }[] = [];

    if (keywords.length > 0) {
      const signalResult = await app.pg.query<typeof trendSignals[number]>(
        `SELECT id, keyword, google_traffic, naver_change_pct, naver_trend_data,
                convergence_score, signal_type, google_post_id, related_post_ids
         FROM trend_signals
         WHERE keyword = ANY($1::text[]) AND expires_at > NOW()
         ORDER BY convergence_score DESC
         LIMIT 3`,
        [keywords]
      );
      trendSignals = signalResult.rows;
    }

    // Resolve google articles from trend signal google_post metadata
    const googlePostIds = trendSignals
      .map(s => s.google_post_id)
      .filter((id): id is number => id !== null);
    const relatedPostIds = trendSignals.flatMap(s => s.related_post_ids ?? []);
    const allResolveIds = [...new Set([...googlePostIds, ...relatedPostIds])].filter(id => id !== postId);

    let resolvedPosts = new Map<number, {
      id: number; title: string; url: string; source_name: string; source_key: string;
      thumbnail: string | null; metadata: { articles?: { title: string; url: string; source: string }[] } | null;
    }>();

    if (allResolveIds.length > 0) {
      const { rows } = await app.pg.query<typeof resolvedPosts extends Map<number, infer V> ? V : never>(
        `SELECT id, title, url, source_name, source_key, thumbnail, metadata
         FROM posts WHERE id = ANY($1::int[])`,
        [allResolveIds]
      );
      for (const r of rows) resolvedPosts.set(r.id, r);
    }

    // Build trend_signals response with google_articles
    const formattedSignals = trendSignals.map(s => {
      const googlePost = s.google_post_id ? resolvedPosts.get(s.google_post_id) : null;
      const google_articles = googlePost?.metadata?.articles ?? [];
      return {
        id: s.id,
        keyword: s.keyword,
        google_traffic: s.google_traffic,
        naver_change_pct: s.naver_change_pct,
        naver_trend_data: s.naver_trend_data,
        convergence_score: s.convergence_score,
        signal_type: s.signal_type,
        google_articles,
      };
    });

    // Build related_articles from trend signal related_post_ids (deduplicated)
    const clusterMemberIds = new Set(clusterResult.rows.map(m => m.id));
    const seenRelated = new Set<number>();
    const relatedArticles: { id: number; title: string; url: string; source_name: string; source_key: string; thumbnail: string | null }[] = [];

    for (const s of trendSignals) {
      for (const rpId of (s.related_post_ids ?? [])) {
        if (rpId === postId || clusterMemberIds.has(rpId) || seenRelated.has(rpId)) continue;
        const rp = resolvedPosts.get(rpId);
        if (!rp) continue;
        seenRelated.add(rpId);
        relatedArticles.push({
          id: rp.id, title: rp.title, url: rp.url,
          source_name: rp.source_name, source_key: rp.source_key, thumbnail: rp.thumbnail,
        });
        if (relatedArticles.length >= 10) break;
      }
      if (relatedArticles.length >= 10) break;
    }

    // Q6: 같은 카테고리 인기글 (현재 포스트·클러스터·관련기사 제외)
    const excludeIds = [postId, ...clusterMemberIds, ...seenRelated];
    let categoryPopular: { id: number; title: string; source_name: string; source_key: string; thumbnail: string | null; view_count: number }[] = [];
    if (postData.category) {
      const { rows: popRows } = await app.pg.query<typeof categoryPopular[number]>(
        `SELECT p.id, p.title, p.source_name, p.source_key, p.thumbnail, p.view_count
         FROM posts p
         LEFT JOIN post_scores ps ON ps.post_id = p.id
         WHERE p.category = $1
           AND p.scraped_at > NOW() - INTERVAL '24 hours'
           AND p.id != ALL($2::int[])
         ORDER BY COALESCE(ps.trend_score, 0) DESC
         LIMIT 5`,
        [postData.category, excludeIds],
      );
      categoryPopular = popRows;
    }

    const result = {
      post: postData,
      trend_score,
      cluster_members: clusterResult.rows,
      trend_signals: formattedSignals,
      engagement_history: engagementResult.rows,
      related_articles: relatedArticles,
      category_popular: categoryPopular,
    };

    detailCache.set(cacheKey, result);
    return result;
  });
}
