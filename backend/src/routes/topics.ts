import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

// ─── Types ───

interface TopicPost {
  id: number;
  title: string;
  sourceKey: string;
  sourceName: string;
}

interface Topic {
  id: string;
  headline: string;
  keywords: string[];
  channels: string[];
  postCount: number;
  momentum: 'rising' | 'steady' | 'falling';
  momentumValue: number;
  convergenceScore: number;
  representativePosts: TopicPost[];
}

// ─── Helpers ───

/** keyword_stats 3h/24h 비율로 모멘텀 판정 */
function classifyMomentum(ratio: number): 'rising' | 'steady' | 'falling' {
  if (ratio >= 1.5) return 'rising';
  if (ratio <= 0.7) return 'falling';
  return 'steady';
}

/** 채널(프론트 표시용)을 category에서 파생 */
function categoryToChannel(category: string | null): string {
  if (!category) return '기타';
  const map: Record<string, string> = {
    community: '커뮤니티', blog: '커뮤니티',
    news: '뉴스', press: '뉴스', newsletter: '뉴스', government: '뉴스',
    video: '영상', video_popular: '영상',
    sns: 'SNS',
    tech: '테크', techblog: '테크',
    finance: '생활', deals: '생활', sports: '생활',
    trend: '트렌드', alert: '속보',
    movie: '영화', performance: '공연',
  };
  return map[category] ?? '기타';
}

/** 문자열 배열로부터 결정론적 해시 ID 생성 */
function hashKeywords(keywords: string[]): string {
  const sorted = [...keywords].sort();
  let hash = 0;
  const str = sorted.join('|');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// ─── Cache ───

const topicsCache = new LRUCache<{ topics: Topic[] }>(5, 60_000);

// ─── Route ───

export async function topicsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/topics', async (_req, reply) => {
    const cached = topicsCache.get('topics');
    if (cached) return reply.send(cached);

    // Step 1: 3h 키워드 top 30 + 24h 대응 rate
    const { rows: kwRows } = await app.pg.query<{
      keyword: string;
      mention_count: number;
      rate_3h: number;
      rate_24h: number;
    }>(`
      SELECT k3.keyword,
        k3.mention_count,
        k3.rate AS rate_3h,
        COALESCE(k24.rate, 0) AS rate_24h
      FROM keyword_stats k3
      LEFT JOIN keyword_stats k24 ON k24.keyword = k3.keyword AND k24.window_hours = 24
      WHERE k3.window_hours = 3
      ORDER BY k3.mention_count DESC
      LIMIT 30
    `);

    if (kwRows.length === 0) {
      const result = { topics: [] };
      topicsCache.set('topics', result);
      return reply.send(result);
    }

    // 키워드별 모멘텀
    const keywordMomentum = new Map<string, number>();
    for (const kw of kwRows) {
      const ratio = kw.rate_24h > 0 ? kw.rate_3h / kw.rate_24h : 2.0;
      keywordMomentum.set(kw.keyword, ratio);
    }

    const topKeywords = kwRows.map(r => r.keyword);

    // Step 2: 이 키워드를 가진 최근 6시간 포스트 찾기
    const { rows: postKwRows } = await app.pg.query<{
      post_id: number;
      keywords: string[];
    }>(`
      SELECT ke.post_id, ke.keywords
      FROM keyword_extractions ke
      JOIN posts p ON p.id = ke.post_id
      WHERE p.scraped_at > NOW() - INTERVAL '6 hours'
        AND ke.keywords && $1::text[]
    `, [topKeywords]);

    if (postKwRows.length === 0) {
      const result = { topics: [] };
      topicsCache.set('topics', result);
      return reply.send(result);
    }

    // Step 3: 포스트 상세 + 클러스터 정보 + 스코어
    const postIds = postKwRows.map(r => r.post_id);
    const [postsResult, clusterResult, scoresResult] = await Promise.all([
      app.pg.query<{
        id: number;
        title: string;
        source_key: string;
        source_name: string;
        category: string | null;
        view_count: number;
      }>(`
        SELECT id, title, source_key, source_name, category, view_count
        FROM posts WHERE id = ANY($1::int[])
      `, [postIds]),
      app.pg.query<{
        post_id: number;
        cluster_id: number;
      }>(`
        SELECT post_id, cluster_id
        FROM post_cluster_members WHERE post_id = ANY($1::int[])
      `, [postIds]),
      app.pg.query<{
        post_id: number;
        trend_score: number;
      }>(`
        SELECT post_id, trend_score
        FROM post_scores WHERE post_id = ANY($1::int[])
      `, [postIds]),
    ]);

    // 룩업 맵 구축
    const postMap = new Map(postsResult.rows.map(p => [p.id, p]));
    const postCluster = new Map(clusterResult.rows.map(c => [c.post_id, c.cluster_id]));
    const postScore = new Map(scoresResult.rows.map(s => [s.post_id, s.trend_score]));
    const postKeywords = new Map(postKwRows.map(pk => [pk.post_id, pk.keywords]));

    // Step 4: 토픽 그룹핑 (Union-Find)
    // 같은 클러스터 또는 키워드 2개 이상 공유 → 같은 토픽
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      if (!parent.has(x)) parent.set(x, x);
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
      return parent.get(x)!;
    };
    const union = (a: number, b: number) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    // 4a. 클러스터 기반 병합
    const clusterPosts = new Map<number, number[]>();
    for (const [pid, cid] of postCluster) {
      const arr = clusterPosts.get(cid) ?? [];
      arr.push(pid);
      clusterPosts.set(cid, arr);
    }
    for (const members of clusterPosts.values()) {
      for (let i = 1; i < members.length; i++) {
        union(members[0], members[i]);
      }
    }

    // 4b. 키워드 공유 기반 병합 (상위 키워드 한정)
    const topKwSet = new Set(topKeywords);
    const keywordPosts = new Map<string, number[]>();
    for (const [pid, kws] of postKeywords) {
      for (const kw of kws) {
        if (!topKwSet.has(kw)) continue;
        const arr = keywordPosts.get(kw) ?? [];
        arr.push(pid);
        keywordPosts.set(kw, arr);
      }
    }
    // 같은 키워드를 공유하는 포스트 병합
    for (const members of keywordPosts.values()) {
      for (let i = 1; i < members.length; i++) {
        union(members[0], members[i]);
      }
    }

    // Step 5: 그룹별 토픽 조립
    const groups = new Map<number, number[]>();
    for (const pid of postIds) {
      const root = find(pid);
      const arr = groups.get(root) ?? [];
      arr.push(pid);
      groups.set(root, arr);
    }

    // convergence score 조회 (trend_signals)
    const { rows: sigRows } = await app.pg.query<{
      keyword: string;
      convergence_score: number;
    }>(`
      SELECT keyword, convergence_score
      FROM trend_signals
      WHERE expires_at > NOW() AND convergence_score > 0
    `);
    const signalMap = new Map(sigRows.map(s => [s.keyword, s.convergence_score]));

    const topics: Topic[] = [];

    for (const [, memberIds] of groups) {
      if (memberIds.length < 2) continue; // 단일 포스트 토픽은 제외

      // 키워드 빈도 집계
      const kwFreq = new Map<string, number>();
      const channels = new Set<string>();
      let totalEngagement = 0;

      for (const pid of memberIds) {
        const post = postMap.get(pid);
        if (!post) continue;
        channels.add(categoryToChannel(post.category));
        totalEngagement += post.view_count;

        const kws = postKeywords.get(pid) ?? [];
        for (const kw of kws) {
          if (topKwSet.has(kw)) {
            kwFreq.set(kw, (kwFreq.get(kw) ?? 0) + 1);
          }
        }
      }

      // 상위 3개 키워드
      const sortedKws = [...kwFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([kw]) => kw);

      if (sortedKws.length === 0) continue;

      // 대표 포스트 (trend_score 상위 3개)
      const rankedPosts = memberIds
        .map(pid => ({ pid, score: postScore.get(pid) ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const representativePosts: TopicPost[] = rankedPosts
        .map(({ pid }) => {
          const p = postMap.get(pid);
          if (!p) return null;
          return { id: p.id, title: p.title, sourceKey: p.source_key, sourceName: p.source_name };
        })
        .filter((p): p is TopicPost => p !== null);

      // 모멘텀: 토픽 키워드 중 최대 모멘텀
      const maxMomentum = Math.max(
        ...sortedKws.map(kw => keywordMomentum.get(kw) ?? 1.0)
      );

      // convergence score: 키워드 매칭 최대값
      const maxConvergence = Math.max(
        0,
        ...sortedKws.map(kw => signalMap.get(kw) ?? 0),
      );

      const headline = representativePosts[0]?.title ?? sortedKws[0];
      const channelArr = [...channels];

      topics.push({
        id: hashKeywords(sortedKws),
        headline,
        keywords: sortedKws,
        channels: channelArr,
        postCount: memberIds.length,
        momentum: classifyMomentum(maxMomentum),
        momentumValue: Math.round(maxMomentum * 100) / 100,
        convergenceScore: maxConvergence,
        representativePosts,
      });
    }

    // 정렬: engagement × momentum × channel diversity
    topics.sort((a, b) => {
      const scoreA = a.postCount * a.momentumValue * a.channels.length;
      const scoreB = b.postCount * b.momentumValue * b.channels.length;
      return scoreB - scoreA;
    });

    const result = { topics: topics.slice(0, 8) };
    topicsCache.set('topics', result);
    return reply.send(result);
  });
}
