import type { Pool } from 'pg';
import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const BATCH_SIZE = 50; // YouTube API videos.list 최대 50개/요청

interface VideoRow {
  id: number;
  url: string;
  source_key: string;
}

interface YouTubeStatistics {
  viewCount?: string;
  commentCount?: string;
  likeCount?: string;
}

interface YouTubeVideoResponse {
  id: string;
  statistics: YouTubeStatistics;
}

/** YouTube 영상 URL에서 video ID 추출 */
function extractVideoId(url: string): string | null {
  // https://www.youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  // https://youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  // https://www.youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  return null;
}

/** YouTube Data API로 통계를 가져와 posts 테이블 + engagement_snapshots에 보강 */
export async function enrichYoutubeEngagement(pool: Pool): Promise<number> {
  if (!config.youtubeApiKey) {
    logger.warn('[yt-enrich] YOUTUBE_API_KEY missing — skipping');
    return 0;
  }

  // 최근 48시간 내 video 포스트 조회.
  // 48h 윈도우 의도적 유지: 그 이후 영상은 마지막 enrichment 값으로 고정 (quota 절약).
  const { rows: posts } = await pool.query<VideoRow>(
    `SELECT id, url, source_key FROM posts
     WHERE category = 'video'
       AND scraped_at > NOW() - INTERVAL '48 hours'
     ORDER BY scraped_at DESC`
  );

  if (!posts.length) {
    logger.info('[yt-enrich] no video posts to enrich');
    return 0;
  }

  // URL → video ID 매핑
  const idMap = new Map<string, number[]>(); // videoId → [postId, ...]
  const postSourceMap = new Map<number, string>();
  let extractFails = 0;
  for (const post of posts) {
    postSourceMap.set(post.id, post.source_key);
    const videoId = extractVideoId(post.url);
    if (!videoId) { extractFails++; continue; }
    const existing = idMap.get(videoId) ?? [];
    existing.push(post.id);
    idMap.set(videoId, existing);
  }
  if (extractFails > 0) {
    logger.warn({ extractFails, sample: posts.slice(0, 3).map(p => p.url) }, '[yt-enrich] extractVideoId failed for some posts');
  }

  const allVideoIds = [...idMap.keys()];
  if (!allVideoIds.length) {
    logger.warn('[yt-enrich] no valid video IDs extracted');
    return 0;
  }

  let totalUpdated = 0;
  const perSource = new Map<string, number>();

  // 50개씩 배치 호출
  for (let i = 0; i < allVideoIds.length; i += BATCH_SIZE) {
    const batch = allVideoIds.slice(i, i + BATCH_SIZE);

    try {
      const { data } = await axios.get<{ items?: YouTubeVideoResponse[] }>(
        'https://www.googleapis.com/youtube/v3/videos',
        {
          params: {
            part: 'statistics',
            id: batch.join(','),
            key: config.youtubeApiKey,
          },
          timeout: 10_000,
        }
      );

      const items = data.items ?? [];
      if (!items.length) continue;

      // posts UPDATE + engagement_snapshots INSERT 준비
      const updateValues: unknown[] = [];
      const updatePlaceholders: string[] = [];
      const snapValues: unknown[] = [];
      const snapPlaceholders: string[] = [];

      for (const item of items) {
        const viewCount = parseInt(item.statistics.viewCount ?? '0', 10);
        const commentCount = parseInt(item.statistics.commentCount ?? '0', 10);
        const likeCount = parseInt(item.statistics.likeCount ?? '0', 10);

        const postIds = idMap.get(item.id);
        if (!postIds) continue;

        for (const postId of postIds) {
          // posts UPDATE: GREATEST 패턴
          const ui = updateValues.length;
          updatePlaceholders.push(`($${ui + 1}::bigint, $${ui + 2}::int, $${ui + 3}::int, $${ui + 4}::int)`);
          updateValues.push(postId, viewCount, commentCount, likeCount);
          const srcKey = postSourceMap.get(postId);
          if (srcKey) perSource.set(srcKey, (perSource.get(srcKey) ?? 0) + 1);

          // engagement_snapshots: 현재 시점 스냅샷
          if (viewCount > 0 || commentCount > 0 || likeCount > 0) {
            const si = snapValues.length;
            snapPlaceholders.push(`($${si + 1}, $${si + 2}, $${si + 3}, $${si + 4})`);
            snapValues.push(postId, viewCount, commentCount, likeCount);
          }
        }
      }

      // Batch UPDATE via CTE
      if (updatePlaceholders.length > 0) {
        const result = await pool.query(
          `UPDATE posts AS p SET
             view_count = GREATEST(p.view_count, v.vc),
             comment_count = GREATEST(p.comment_count, v.cc),
             like_count = GREATEST(p.like_count, v.lc)
           FROM (VALUES ${updatePlaceholders.join(',')}) AS v(pid, vc, cc, lc)
           WHERE p.id = v.pid`,
          updateValues
        );
        totalUpdated += result.rowCount ?? 0;
      }

      // Engagement snapshots
      if (snapPlaceholders.length > 0) {
        await pool.query(
          `INSERT INTO engagement_snapshots (post_id, view_count, comment_count, like_count)
           VALUES ${snapPlaceholders.join(',')}`,
          snapValues
        );
      }
    } catch (err) {
      logger.warn({ err, batchStart: i }, '[yt-enrich] API batch failed');
    }
  }

  logger.info(
    { totalUpdated, videoIds: allVideoIds.length, perSource: Object.fromEntries(perSource), extractFails },
    '[yt-enrich] enrichment complete'
  );
  return totalUpdated;
}
