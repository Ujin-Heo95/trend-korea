import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

interface RelatedPost {
  id: number;
  title: string;
  url: string;
  source_name: string;
  source_key: string;
}

interface BigKindsIssue {
  rank: number;
  keyword: string;
  articleCount: number;
  period: string;
  bigkindsUrl: string;
  relatedPosts: RelatedPost[];
}

interface BigKindsPostRow {
  id: number;
  title: string;
  url: string;
  view_count: number;
  metadata: {
    rank?: number;
    articleCount?: number;
    keyword?: string;
    period?: string;
  } | null;
}

const cache = new LRUCache<{ issues: BigKindsIssue[] }>(10, 60_000);

export async function trendSignalsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/trends/signals', async (_request, reply) => {
    const cached = cache.get('bigkinds');
    if (cached) return reply.send(cached);

    // 1. BigKinds posts 조회 (최근 24시간, rank 순)
    const { rows: bkPosts } = await app.pg.query<BigKindsPostRow>(
      `SELECT id, title, url, view_count, metadata
       FROM posts
       WHERE source_key = 'bigkinds_issues'
         AND scraped_at > NOW() - INTERVAL '24 hours'
       ORDER BY (metadata->>'rank')::int ASC NULLS LAST
       LIMIT 10`,
    );

    if (bkPosts.length === 0) {
      const result = { issues: [] };
      cache.set('bigkinds', result);
      return reply.send(result);
    }

    // 2. 각 이슈 키워드로 커뮤니티 매칭 게시글 조회
    const issues: BigKindsIssue[] = [];

    for (const post of bkPosts) {
      const keyword = post.metadata?.keyword ?? post.title;
      const rank = post.metadata?.rank ?? 0;
      const articleCount = post.metadata?.articleCount ?? post.view_count;
      const period = post.metadata?.period ?? '';

      // 키워드에서 핵심 단어 추출 (2글자 이상 단어 기준 매칭)
      const searchTerms = extractSearchTerms(keyword);
      let relatedPosts: RelatedPost[] = [];

      if (searchTerms.length > 0) {
        const conditions = searchTerms.map((_, i) => `title ILIKE $${i + 1}`).join(' AND ');
        const params = searchTerms.map(t => `%${t}%`);

        const { rows } = await app.pg.query<RelatedPost>(
          `SELECT id, title, url, source_name, source_key
           FROM posts
           WHERE source_key != 'bigkinds_issues'
             AND scraped_at > NOW() - INTERVAL '6 hours'
             AND (${conditions})
           ORDER BY scraped_at DESC
           LIMIT 3`,
          params,
        );
        relatedPosts = rows;
      }

      issues.push({
        rank,
        keyword,
        articleCount,
        period,
        bigkindsUrl: post.url,
        relatedPosts,
      });
    }

    const result = { issues };
    cache.set('bigkinds', result);
    return reply.send(result);
  });
}

/** 키워드에서 검색용 핵심 단어 추출 (2글자 이상, 최대 3개) */
function extractSearchTerms(keyword: string): string[] {
  // 따옴표/괄호/특수문자 제거, 공백 기준 분리
  const words = keyword
    .replace(/[''""'"「」…·,.:;!?%]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2)
    // 불용어 제거
    .filter(w => !STOP_WORDS.has(w));

  // 고유명사/핵심 단어 우선 (3글자 이상)
  const sorted = [...words].sort((a, b) => b.length - a.length);
  return sorted.slice(0, 3);
}

const STOP_WORDS = new Set([
  '오늘', '내일', '어제', '관련', '발표', '이번', '대한', '통해',
  '위해', '이후', '현재', '지난', '올해', '작년', '것으로', '하는',
  '있는', '되는', '한다', '한편', '이날', '해당', '최근', '전날',
]);
