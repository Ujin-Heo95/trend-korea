import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';
import type { IssueRankingRow } from '../db/types.js';

const issuesCache = new LRUCache<unknown>(50, 600_000);

/** 외부에서 캐시 무효화 (요약 완료 후 호출) */
export function clearIssuesCache(): void {
  issuesCache.clear();
}

interface RelatedPost {
  id: number;
  source_name: string;
  source_key: string;
  title: string;
  url: string;
  thumbnail: string | null;
  view_count: number;
  comment_count: number;
}

type ChannelTag = 'news' | 'community' | 'portal' | 'sns';

// Portal trend source keys (trend_keywords 테이블의 source_key)
const PORTAL_SOURCES = new Set([
  'google_trends', 'wikipedia_ko',
]);

// SNS trend source keys
const SNS_SOURCES = new Set([
  'apify_x_trending', 'apify_instagram', 'apify_tiktok',
]);

export async function issueRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { page?: number; limit?: number; cursor_score?: number; cursor_id?: number } }>(
    '/api/issues',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            cursor_score: { type: 'number' },
            cursor_id: { type: 'integer' },
          },
        },
      },
    },
    async (req) => {
      const limit = req.query.limit ?? 20;
      const page = req.query.page ?? 1;
      const cursorScore = req.query.cursor_score;
      const cursorId = req.query.cursor_id;
      const offset = (page - 1) * limit;

      const cacheKey = `issues:${page}:${limit}`;
      const cached = issuesCache.get(cacheKey);
      if (cached) return cached;

      // Try materialized response first (pre-computed, fastest path)
      if (limit === 20) {
        const { rows: matRows } = await app.pg.query<{ response_json: unknown }>(
          `SELECT response_json FROM issue_rankings_materialized WHERE page = $1 AND page_size = $2`,
          [page, 20],
        );
        if (matRows.length > 0 && matRows[0].response_json) {
          const result = matRows[0].response_json;
          issuesCache.set(cacheKey, result);
          return result;
        }
      }

      // Fallback: compute from issue_rankings (non-standard page sizes or empty materialized)
      // Cursor-based pagination when cursor_score + cursor_id provided
      const useCursor = cursorScore != null && cursorId != null;
      const [issueResult, countResult] = await Promise.all([
        useCursor
          ? app.pg.query<IssueRankingRow>(
              `SELECT * FROM issue_rankings
               WHERE expires_at > NOW() AND summary IS NOT NULL
                 AND (issue_score, id) < ($2, $3)
               ORDER BY issue_score DESC, id DESC
               LIMIT $1`,
              [limit, cursorScore, cursorId],
            )
          : app.pg.query<IssueRankingRow>(
              `SELECT * FROM issue_rankings
               WHERE expires_at > NOW() AND summary IS NOT NULL
               ORDER BY issue_score DESC
               LIMIT $1 OFFSET $2`,
              [limit, offset],
            ),
        app.pg.query<{ total: number }>(
          `SELECT COUNT(*)::int AS total FROM issue_rankings WHERE expires_at > NOW() AND summary IS NOT NULL`,
        ),
      ]);

      const issues = issueResult.rows;
      if (issues.length === 0) {
        const empty = { issues: [], total: 0, calculated_at: null };
        issuesCache.set(cacheKey, empty);
        return empty;
      }

      // Collect all post IDs to fetch in one query
      const allClusterIds = new Set<number>();
      const allStandaloneIds = new Set<number>();
      for (const issue of issues) {
        for (const cid of issue.cluster_ids) allClusterIds.add(cid);
        for (const pid of issue.standalone_post_ids) allStandaloneIds.add(pid);
      }

      // Fetch cluster member post IDs
      const clusterPostMap = new Map<number, number[]>();
      if (allClusterIds.size > 0) {
        const cm = await app.pg.query<{ cluster_id: number; post_id: number }>(
          `SELECT cluster_id, post_id FROM post_cluster_members
           WHERE cluster_id = ANY($1::int[])`,
          [[...allClusterIds]],
        );
        for (const r of cm.rows) {
          const arr = clusterPostMap.get(r.cluster_id) ?? [];
          arr.push(r.post_id);
          clusterPostMap.set(r.cluster_id, arr);
        }
      }

      // Gather all post IDs across all issues
      const allPostIds = new Set<number>();
      for (const issue of issues) {
        for (const cid of issue.cluster_ids) {
          for (const pid of clusterPostMap.get(cid) ?? []) allPostIds.add(pid);
        }
        for (const pid of issue.standalone_post_ids) allPostIds.add(pid);
      }

      // Fetch all posts in one query
      const postsMap = new Map<number, RelatedPost & { category: string | null }>();
      if (allPostIds.size > 0) {
        const posts = await app.pg.query<RelatedPost & { category: string | null }>(
          `SELECT id, source_name, source_key, title, url, thumbnail, view_count, comment_count, category
           FROM posts WHERE id = ANY($1::int[])`,
          [[...allPostIds]],
        );
        for (const p of posts.rows) postsMap.set(p.id, p);
      }

      // Build response
      const responseIssues = issues.map((issue, idx) => {
        // Collect post IDs for this issue
        const issuePostIds = new Set<number>();
        for (const cid of issue.cluster_ids) {
          for (const pid of clusterPostMap.get(cid) ?? []) issuePostIds.add(pid);
        }
        for (const pid of issue.standalone_post_ids) issuePostIds.add(pid);

        // Split into news/community/video
        const newsPosts: RelatedPost[] = [];
        const communityPosts: RelatedPost[] = [];
        const videoPosts: RelatedPost[] = [];
        for (const pid of issuePostIds) {
          const post = postsMap.get(pid);
          if (!post) continue;
          const { category, ...rest } = post;
          if (category === 'news' || category === 'portal') {
            newsPosts.push(rest);
          } else if (category === 'video') {
            videoPosts.push(rest);
          } else {
            communityPosts.push(rest);
          }
        }

        // Sort by view_count desc
        newsPosts.sort((a, b) => b.view_count - a.view_count);
        communityPosts.sort((a, b) => b.view_count - a.view_count);
        videoPosts.sort((a, b) => b.view_count - a.view_count);

        // Classify matched_trend_keywords into portal vs sns
        const portalKeywords: string[] = [];
        const snsKeywords: string[] = [];
        for (const kw of issue.matched_trend_keywords) {
          // Keywords include source prefix from trendSignals matching
          // Check cross_validation_sources for channel classification
        }
        // Use cross_validation_sources to determine portal/sns presence
        const cvSources = issue.cross_validation_sources ?? [];
        for (const src of cvSources) {
          if (PORTAL_SOURCES.has(src)) portalKeywords.push(src);
          if (SNS_SOURCES.has(src)) snsKeywords.push(src);
        }

        // Build channel tags
        const channelTags: ChannelTag[] = [];
        if (newsPosts.length > 0 || videoPosts.length > 0) channelTags.push('news');
        if (communityPosts.length > 0) channelTags.push('community');
        if (portalKeywords.length > 0 || issue.matched_trend_keywords.length > 0) channelTags.push('portal');
        if (snsKeywords.length > 0) channelTags.push('sns');

        const currentRank = offset + idx + 1;
        return {
          id: issue.id,
          rank: currentRank,
          title: issue.title,
          summary: issue.summary,
          category_label: issue.category_label,
          issue_score: issue.issue_score,
          momentum_score: issue.momentum_score ?? 1.0,
          thumbnail: issue.representative_thumbnail,
          stable_id: issue.stable_id,
          rank_change: issue.rank_change,
          // AI quality signals
          quality_score: issue.quality_score ?? null,
          ai_keywords: issue.ai_keywords ?? [],
          sentiment: issue.sentiment ?? null,
          // Posts by channel
          news_posts: newsPosts.slice(0, 10),
          community_posts: communityPosts.slice(0, 10),
          video_posts: videoPosts.slice(0, 10),
          // Keywords
          matched_keywords: issue.matched_trend_keywords,
          portal_keywords: [...new Set(portalKeywords)],
          sns_keywords: [...new Set(snsKeywords)],
          // Counts
          news_post_count: issue.news_post_count,
          community_post_count: issue.community_post_count,
          video_post_count: issue.video_post_count,
          // Channel tags
          channel_tags: channelTags,
        };
      });

      // next_cursor for keyset pagination
      const lastIssue = issues[issues.length - 1];
      const nextCursor = lastIssue && responseIssues.length === limit
        ? { cursor_score: lastIssue.issue_score, cursor_id: lastIssue.id }
        : null;

      const result = {
        issues: responseIssues,
        total: countResult.rows[0].total,
        calculated_at: issues[0]?.calculated_at ?? null,
        next_cursor: nextCursor,
      };
      issuesCache.set(cacheKey, result);
      return result;
    },
  );
}
