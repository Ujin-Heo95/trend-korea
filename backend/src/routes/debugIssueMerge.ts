/**
 * GET /api/debug/issue-merge?issueId=  (NODE_ENV !== 'production' only)
 *
 * 이슈 과병합 진단용 — 한 이슈에 묶인 포스트들의 공유 키워드와 IDF, 임베딩 cosine을 노출.
 * Phase 4: 사람 검수로 IDF/cos 임계값 튜닝 결정에 활용.
 */
import type { FastifyInstance } from 'fastify';
import { cosineSimilarity as embeddingCosine } from '../services/embedding.js';
import { extractEntities } from '../services/entityExtractor.js';

interface IssueRow {
  id: number;
  title: string;
  cluster_ids: number[];
  standalone_post_ids: number[];
  matched_trend_keywords: string[] | null;
  issue_score: number;
}

interface PostRow {
  id: number;
  title: string;
  source_key: string;
  trend_score: number | null;
}

interface IdfRow {
  keyword_normalized: string;
  idf: number;
}

export async function debugIssueMergeRoutes(app: FastifyInstance): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  app.get<{ Querystring: { issueId?: string } }>('/api/debug/issue-merge', async (req, reply) => {
    const issueId = parseInt(req.query.issueId ?? '', 10);
    if (isNaN(issueId)) return reply.status(400).send({ error: 'issueId required' });

    const { rows: issueRows } = await app.pg.query<IssueRow>(
      `SELECT id, title, cluster_ids, standalone_post_ids, matched_trend_keywords, issue_score
       FROM issue_rankings WHERE id = $1`,
      [issueId],
    );
    if (issueRows.length === 0) return reply.status(404).send({ error: 'issue not found' });
    const issue = issueRows[0];

    // 1) 이 이슈에 포함된 모든 포스트
    const clusterIds = issue.cluster_ids ?? [];
    const standaloneIds = issue.standalone_post_ids ?? [];
    const { rows: posts } = await app.pg.query<PostRow>(
      `SELECT p.id, p.title, p.source_key, ps.trend_score
       FROM posts p
       LEFT JOIN post_scores ps ON ps.post_id = p.id
       WHERE p.id = ANY($1::int[])
          OR p.id IN (
            SELECT post_id FROM post_cluster_members WHERE cluster_id = ANY($2::int[])
          )
       ORDER BY ps.trend_score DESC NULLS LAST`,
      [standaloneIds, clusterIds],
    );

    // 2) 매칭된 키워드의 IDF
    const kws = issue.matched_trend_keywords ?? [];
    let idfRows: IdfRow[] = [];
    if (kws.length > 0) {
      const result = await app.pg.query<IdfRow>(
        `SELECT keyword_normalized, idf FROM keyword_idf
         WHERE keyword_normalized = ANY($1::text[])`,
        [kws],
      );
      idfRows = result.rows;
    }
    const idfMap = new Map(idfRows.map(r => [r.keyword_normalized, Number(r.idf)]));
    const keywordIdf = kws.map(kw => ({
      keyword: kw,
      idf: idfMap.get(kw) ?? null,
    }));
    const idfSum = keywordIdf.reduce((s, k) => s + (k.idf ?? 0), 0);

    // 3) 포스트 쌍별 임베딩 cosine (상위 5개만, N²이 폭발하지 않도록)
    const topPosts = posts.slice(0, 5);
    const pairCos: { a: number; b: number; titleA: string; titleB: string; cos: number | null }[] = [];
    for (let i = 0; i < topPosts.length; i++) {
      for (let j = i + 1; j < topPosts.length; j++) {
        const cos = embeddingCosine(topPosts[i].id, topPosts[j].id);
        pairCos.push({
          a: topPosts[i].id,
          b: topPosts[j].id,
          titleA: topPosts[i].title,
          titleB: topPosts[j].title,
          cos,
        });
      }
    }

    // 4) 포스트별 entity 추출 (Phase 4: entity hard-gate 진단)
    const postsWithEntities = posts.map(p => ({
      ...p,
      entities: [...extractEntities(p.title)],
    }));
    const allEntities = new Set<string>();
    for (const p of postsWithEntities) for (const e of p.entities) allEntities.add(e);

    return {
      issue: {
        id: issue.id,
        title: issue.title,
        score: issue.issue_score,
        clusterIds,
        standalonePostIds: standaloneIds,
      },
      posts: postsWithEntities,
      uniqueEntities: [...allEntities],
      keywordIdf,
      idfSum,
      pairCos,
    };
  });
}
