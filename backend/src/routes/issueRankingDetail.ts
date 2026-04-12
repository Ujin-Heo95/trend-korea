import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';
import type { IssueRankingRow } from '../db/types.js';

const cache = new LRUCache<unknown>(200, 60_000);

interface RelatedPost {
  readonly id: number;
  readonly source_name: string;
  readonly source_key: string;
  readonly title: string;
  readonly url: string;
  readonly thumbnail: string | null;
  readonly view_count: number;
  readonly comment_count: number;
}

type ChannelTag = 'news' | 'community' | 'portal' | 'sns';

// Portal trend source keys (trend_keywords 테이블의 source_key)
const PORTAL_SOURCES = new Set([
  'google_trends', 'wikipedia_ko',
]);

const SNS_SOURCES = new Set<string>();

export async function issueRankingDetailRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { issueId: string } }>('/api/issues/:issueId', async (req, reply) => {
    const issueId = parseInt(req.params.issueId);
    if (isNaN(issueId)) return reply.status(400).send({ error: 'Invalid issue ID' });

    const cacheKey = `issue-ranking-detail:${issueId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    // Fetch issue from issue_rankings
    const { rows } = await app.pg.query<IssueRankingRow>(
      `SELECT * FROM issue_rankings WHERE id = $1 AND expires_at > NOW()`,
      [issueId],
    );

    const issue = rows[0];
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    // ─── Dynamic rank_change: current rank vs latest history snapshot ───
    const [rankResult, historyResult] = await Promise.all([
      app.pg.query<{ current_rank: number }>(
        `SELECT COUNT(*)::int + 1 AS current_rank
         FROM issue_rankings
         WHERE expires_at > NOW() AND issue_score > $1`,
        [issue.issue_score],
      ),
      app.pg.query<{
        rank_position: number;
        stable_id: string | null;
        cluster_ids: number[];
        standalone_post_ids: number[];
      }>(`
        SELECT rank_position, stable_id, cluster_ids, standalone_post_ids
        FROM issue_rankings_history
        WHERE batch_id = (SELECT MAX(batch_id) FROM issue_rankings_history)
        ORDER BY rank_position ASC
      `),
    ]);

    const currentRank = rankResult.rows[0]?.current_rank ?? 0;
    const prevRows = historyResult.rows;

    let dynamicRankChange: number | null = null;
    if (prevRows.length > 0) {
      const byStableId = prevRows.find(r => r.stable_id && r.stable_id === issue.stable_id);
      if (byStableId) {
        dynamicRankChange = byStableId.rank_position - currentRank;
      } else {
        const currIds = [...issue.cluster_ids, ...issue.standalone_post_ids];
        for (const prev of prevRows) {
          const prevIds = new Set([...prev.cluster_ids, ...prev.standalone_post_ids]);
          if (prevIds.size === 0 && currIds.length === 0) continue;
          const overlap = currIds.filter(id => prevIds.has(id)).length;
          const maxSize = Math.max(prevIds.size, currIds.length);
          if (maxSize > 0 && overlap / maxSize >= 0.5) {
            dynamicRankChange = prev.rank_position - currentRank;
            break;
          }
        }
      }
    }

    // Collect all post IDs from clusters + standalone
    const postIds = new Set<number>();
    for (const pid of issue.standalone_post_ids) postIds.add(pid);

    if (issue.cluster_ids.length > 0) {
      const cm = await app.pg.query<{ post_id: number }>(
        `SELECT post_id FROM post_cluster_members WHERE cluster_id = ANY($1::int[])`,
        [issue.cluster_ids],
      );
      for (const r of cm.rows) postIds.add(r.post_id);
    }

    // Fetch all related posts
    const newsPosts: RelatedPost[] = [];
    const communityPosts: RelatedPost[] = [];
    const videoPosts: RelatedPost[] = [];

    if (postIds.size > 0) {
      const posts = await app.pg.query<RelatedPost & { category: string | null }>(
        `SELECT id, source_name, source_key, title, url, thumbnail, view_count, comment_count, category
         FROM posts WHERE id = ANY($1::int[])
         ORDER BY view_count DESC`,
        [[...postIds]],
      );
      for (const p of posts.rows) {
        const { category, ...rest } = p;
        if (category === 'news' || category === 'portal') {
          newsPosts.push(rest);
        } else if (category === 'video') {
          videoPosts.push(rest);
        } else {
          communityPosts.push(rest);
        }
      }
    }

    // Build channel tags
    const portalKeywords: string[] = [];
    const snsKeywords: string[] = [];
    const cvSources = issue.cross_validation_sources ?? [];
    for (const src of cvSources) {
      if (PORTAL_SOURCES.has(src)) portalKeywords.push(src);
      if (SNS_SOURCES.has(src)) snsKeywords.push(src);
    }

    const channelTags: ChannelTag[] = [];
    if (newsPosts.length > 0 || videoPosts.length > 0) channelTags.push('news');
    if (communityPosts.length > 0) channelTags.push('community');
    if (portalKeywords.length > 0 || issue.matched_trend_keywords.length > 0) channelTags.push('portal');
    if (snsKeywords.length > 0) channelTags.push('sns');

    const result = {
      issue: {
        id: issue.id,
        title: issue.title,
        summary: issue.summary,
        category_label: issue.category_label,
        issue_score: issue.issue_score,
        thumbnail: issue.representative_thumbnail,
        rank_change: dynamicRankChange,
        calculated_at: issue.calculated_at,
      },
      news_posts: newsPosts,
      community_posts: communityPosts,
      video_posts: videoPosts,
      matched_keywords: issue.matched_trend_keywords,
      portal_keywords: [...new Set(portalKeywords)],
      sns_keywords: [...new Set(snsKeywords)],
      channel_tags: channelTags,
      news_post_count: issue.news_post_count,
      community_post_count: issue.community_post_count,
      video_post_count: issue.video_post_count,
    };

    cache.set(cacheKey, result);
    return result;
  });
}
