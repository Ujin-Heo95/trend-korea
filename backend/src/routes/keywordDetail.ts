import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';
import { explainKeywordTrend } from '../services/gemini.js';
import pLimit from 'p-limit';

const geminiLimit = pLimit(3);

const cache = new LRUCache<unknown>(100, 3 * 60_000); // 3분 TTL

export async function keywordDetailRoutes(app: FastifyInstance): Promise<void> {
  // 키워드 상세 — 해당 키워드를 포함하는 최신 이슈 + 관련 키워드
  app.get<{ Params: { keyword: string } }>(
    '/api/keyword/:keyword',
    async (req, reply) => {
      const keyword = decodeURIComponent(req.params.keyword).trim();
      if (!keyword || keyword.length > 100) {
        return reply.status(400).send({ error: 'Invalid keyword' });
      }

      const cacheKey = `keyword-detail:${keyword}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      // Q1: 이 키워드를 포함하는 최신 포스트 (최대 20개)
      const { rows: posts } = await app.pg.query<{
        id: number; source_key: string; source_name: string; title: string;
        thumbnail: string | null; view_count: number; category: string | null;
        scraped_at: string; cluster_size: number | null;
      }>(
        `SELECT DISTINCT ON (p.id)
                p.id, p.source_key, p.source_name, p.title,
                p.thumbnail, p.view_count, p.category, p.scraped_at,
                (SELECT COUNT(*)::int FROM post_cluster_members pcm WHERE pcm.cluster_id = (
                  SELECT cluster_id FROM post_cluster_members WHERE post_id = p.id LIMIT 1
                )) AS cluster_size
         FROM posts p
         JOIN keyword_extractions ke ON ke.post_id = p.id
         WHERE $1 = ANY(ke.keywords)
           AND p.scraped_at > NOW() - INTERVAL '3 days'
         ORDER BY p.id, p.scraped_at DESC
         LIMIT 20`,
        [keyword],
      );

      // Q2: 관련 키워드 (같은 포스트에 자주 동시 등장)
      const { rows: relatedKw } = await app.pg.query<{ keyword: string; co_count: number }>(
        `SELECT unnested AS keyword, COUNT(*) AS co_count
         FROM keyword_extractions ke,
              LATERAL unnest(ke.keywords) AS unnested
         WHERE ke.post_id IN (
           SELECT ke2.post_id FROM keyword_extractions ke2
           WHERE $1 = ANY(ke2.keywords)
           LIMIT 50
         )
           AND unnested != $1
         GROUP BY unnested
         ORDER BY co_count DESC
         LIMIT 10`,
        [keyword],
      );

      // Q3: 키워드 통계 + 버스트 설명 (있으면)
      const { rows: stats } = await app.pg.query<{
        mention_count: number; rate: number; calculated_at: string;
        dominant_tone: string | null;
        burst_explanation: string | null; z_score: number | null;
      }>(
        `SELECT ks.mention_count, ks.rate, ks.calculated_at, ks.dominant_tone,
                kbe.explanation AS burst_explanation, kbe.z_score
         FROM keyword_stats ks
         LEFT JOIN keyword_burst_explanations kbe
           ON kbe.keyword = ks.keyword AND kbe.expires_at > NOW()
         WHERE ks.keyword = $1 AND ks.window_hours = 3
         LIMIT 1`,
        [keyword],
      );

      // AI 설명: 버스트 설명이 있으면 사용, 없으면 on-demand 생성 (캐시)
      const stat = stats[0] ?? null;
      let aiExplanation: string | null = stat?.burst_explanation ?? null;
      if (!aiExplanation && posts.length >= 2) {
        const titles = posts.slice(0, 5).map(p => p.title);
        aiExplanation = await geminiLimit(() => explainKeywordTrend(keyword, titles));
      }

      const result = {
        keyword,
        posts: posts.map(p => ({
          ...p,
          cluster_size: p.cluster_size ?? 1,
        })),
        related_keywords: relatedKw.map(r => r.keyword),
        stats: stat ? {
          mention_count: stat.mention_count,
          rate: stat.rate,
          calculated_at: stat.calculated_at,
          tone: stat.dominant_tone ?? undefined,
          zScore: stat.z_score != null ? Number(stat.z_score) : undefined,
        } : null,
        aiExplanation,
      };

      cache.set(cacheKey, result);
      return result;
    },
  );
}
