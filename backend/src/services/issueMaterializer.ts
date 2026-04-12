import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';

// v8 cutover (2026-04-13): extracted from legacy issueAggregator.ts.
// Holds the 3 post-pipeline utilities that both legacy and v8 paths share:
//   - snapshotRankings     (hourly history snapshot)
//   - cleanExpiredIssueRankings (TTL cleanup)
//   - materializeIssueResponse  (pre-compute API response from issue_rankings)

export async function snapshotRankings(pool: Pool): Promise<void> {
  const batchId = new Date().toISOString();

  const { rowCount } = await pool.query(
    `INSERT INTO issue_rankings_history (batch_id, rank_position, title, issue_score, momentum_score, stable_id, cluster_ids, standalone_post_ids)
     SELECT $1, ROW_NUMBER() OVER (ORDER BY issue_score DESC), title, issue_score, COALESCE(momentum_score, 1.0), stable_id, cluster_ids, standalone_post_ids
     FROM issue_rankings WHERE expires_at > NOW() AND window_hours = 12`,
    [batchId],
  );
  if (rowCount && rowCount > 0) {
    console.log(`[issueMaterializer] snapshot: ${rowCount} rankings saved (batch ${batchId})`);
  }

  await pool.query(
    `DELETE FROM issue_rankings_history WHERE created_at < NOW() - INTERVAL '7 days'`,
  );
}

export async function cleanExpiredIssueRankings(pool: Pool): Promise<number> {
  const result = await pool.query('DELETE FROM issue_rankings WHERE expires_at < NOW()');
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) console.log(`[issueMaterializer] cleaned ${deleted} expired issue rankings`);
  return deleted;
}

/**
 * 이슈 API 응답을 사전 계산하여 DB에 저장.
 * summarizeAndUpdateIssues 완료 후 호출. API에서는 이 테이블에서 단순 SELECT.
 */
export async function materializeIssueResponse(pool: Pool): Promise<void> {
  const { rows: allIssues } = await pool.query<{
    id: number; title: string; summary: string | null; category_label: string | null;
    issue_score: number; momentum_score: number; representative_thumbnail: string | null;
    stable_id: string | null; rank_change: number | null;
    quality_score: number | null; ai_keywords: string[]; sentiment: string | null;
    cluster_ids: number[]; standalone_post_ids: number[];
    matched_trend_keywords: string[]; cross_validation_sources: string[];
    news_post_count: number; community_post_count: number; video_post_count: number;
    calculated_at: string; window_hours: number;
  }>(
    `SELECT * FROM issue_rankings
     WHERE expires_at > NOW() AND summary IS NOT NULL
     ORDER BY window_hours, issue_score DESC`,
  );

  if (allIssues.length === 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM issue_rankings_materialized');
      await client.query('COMMIT');
      logger.warn('[materialize] no issues with summary — cleared materialized table');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  const issuesByWindow = new Map<number, typeof allIssues>();
  for (const issue of allIssues) {
    const arr = issuesByWindow.get(issue.window_hours) ?? [];
    arr.push(issue);
    issuesByWindow.set(issue.window_hours, arr);
  }

  const allClusterIds = new Set<number>();
  const allStandaloneIds = new Set<number>();
  for (const issue of allIssues) {
    for (const cid of issue.cluster_ids) allClusterIds.add(cid);
    for (const pid of issue.standalone_post_ids) allStandaloneIds.add(pid);
  }

  const clusterPostMap = new Map<number, number[]>();
  if (allClusterIds.size > 0) {
    const { rows: cm } = await pool.query<{ cluster_id: number; post_id: number }>(
      `SELECT cluster_id, post_id FROM post_cluster_members WHERE cluster_id = ANY($1::int[])`,
      [[...allClusterIds]],
    );
    for (const r of cm) {
      const arr = clusterPostMap.get(r.cluster_id) ?? [];
      arr.push(r.post_id);
      clusterPostMap.set(r.cluster_id, arr);
    }
  }

  const allPostIds = new Set<number>();
  for (const issue of allIssues) {
    for (const cid of issue.cluster_ids) {
      for (const pid of clusterPostMap.get(cid) ?? []) allPostIds.add(pid);
    }
    for (const pid of issue.standalone_post_ids) allPostIds.add(pid);
  }

  const postsMap = new Map<number, { id: number; source_name: string; source_key: string; title: string; url: string; thumbnail: string | null; view_count: number; comment_count: number; category: string | null }>();
  if (allPostIds.size > 0) {
    const { rows: posts } = await pool.query<{
      id: number; source_name: string; source_key: string; title: string; url: string;
      thumbnail: string | null; view_count: number; comment_count: number; category: string | null;
    }>(
      `SELECT id, source_name, source_key, title, url, thumbnail, view_count, comment_count, category
       FROM posts WHERE id = ANY($1::int[])`,
      [[...allPostIds]],
    );
    for (const p of posts) postsMap.set(p.id, p);
  }

  const PAGE_SIZE = 20;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM issue_rankings_materialized');

    for (const [windowHours, issues] of issuesByWindow) {
      const totalPages = Math.ceil(issues.length / PAGE_SIZE);

      for (let page = 1; page <= totalPages; page++) {
        const pageIssues = issues.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

        const responseIssues = pageIssues.map((issue, idx) => {
          const issuePostIds = new Set<number>();
          for (const cid of issue.cluster_ids) {
            for (const pid of clusterPostMap.get(cid) ?? []) issuePostIds.add(pid);
          }
          for (const pid of issue.standalone_post_ids) issuePostIds.add(pid);

          const newsPosts: unknown[] = [];
          const communityPosts: unknown[] = [];
          const videoPosts: unknown[] = [];
          for (const pid of issuePostIds) {
            const post = postsMap.get(pid);
            if (!post) continue;
            const { category, ...rest } = post;
            if (category === 'news' || category === 'portal') newsPosts.push(rest);
            else if (category === 'video') videoPosts.push(rest);
            else communityPosts.push(rest);
          }

          const currentRank = (page - 1) * PAGE_SIZE + idx + 1;
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
            quality_score: issue.quality_score,
            ai_keywords: issue.ai_keywords ?? [],
            sentiment: issue.sentiment,
            news_posts: newsPosts.slice(0, 10),
            community_posts: communityPosts.slice(0, 10),
            video_posts: videoPosts.slice(0, 10),
            matched_keywords: issue.matched_trend_keywords,
            news_post_count: issue.news_post_count,
            community_post_count: issue.community_post_count,
            video_post_count: issue.video_post_count,
          };
        });

        // calculated_at 은 반드시 현재 materialize 실행 시각 (stale payload 방지).
        const materializedAt = new Date().toISOString();
        const responseJson = {
          issues: responseIssues,
          total: issues.length,
          calculated_at: materializedAt,
        };

        await client.query(
          `INSERT INTO issue_rankings_materialized (page, page_size, total, response_json, calculated_at, window_hours)
           VALUES ($1, $2, $3, $4, NOW(), $5)`,
          [page, PAGE_SIZE, issues.length, JSON.stringify(responseJson), windowHours],
        );
      }
    }

    await client.query('COMMIT');
    const windowKeys = [...issuesByWindow.keys()].join(',');
    logger.info(`[materialize] materialized for windows: ${windowKeys}h`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.warn({ err }, '[materialize] failed to materialize issue response');
  } finally {
    client.release();
  }
}
