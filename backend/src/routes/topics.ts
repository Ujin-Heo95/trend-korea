import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';
import { detectBursts } from '../services/keywords.js';
import { getSourceWeight } from '../services/scoring.js';
import { summarizeTopicsBatch } from '../services/gemini.js';

// ─── Types ───

interface TopicPost {
  id: number;
  title: string;
  sourceKey: string;
  sourceName: string;
  thumbnail: string | null;
}

interface TopicSource {
  key: string;
  name: string;
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
  unifiedScore: number;
  burstScore: number;
  rank: number;
  previousRank: number | null;
  changeType: 'new' | 'up' | 'down' | 'same';
  changeAmount: number;
  confidence: 'high' | 'medium' | 'low';
  representativePosts: TopicPost[];
  thumbnail: string | null;
  sources: TopicSource[];
  sourceCount: number;
  summaryHeadline: string | null;
  summaryBody: string | null;
}

// ─── Helpers ───

function classifyMomentum(ratio: number): 'rising' | 'steady' | 'falling' {
  if (ratio >= 1.5) return 'rising';
  if (ratio <= 0.7) return 'falling';
  return 'steady';
}

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

function hashKeywords(keywords: string[]): string {
  const sorted = [...keywords].sort();
  let hash = 0;
  const str = sorted.join('|');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** 신뢰도 판정: 채널 수 + convergence 기반 */
function classifyConfidence(channels: string[], convergence: number): 'high' | 'medium' | 'low' {
  const signalCount = channels.length + (convergence > 5 ? 1 : 0);
  if (signalCount >= 3) return 'high';
  if (signalCount >= 2) return 'medium';
  return 'low';
}

// ─── Cache ───

const topicsCache = new LRUCache<{ topics: Topic[] }>(5, 60_000);
const editorialCache = new LRUCache<unknown>(5, 5 * 60_000); // 5분 TTL

// ─── Route ───

export async function topicsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/topics', async (_req, reply) => {
    const cached = topicsCache.get('topics');
    if (cached) return reply.send(cached);

    // Step 1: 3h 키워드 top 30 + 24h 대응 rate (품질 필터: 억제 키워드 제외)
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
      LEFT JOIN keyword_suppressions ks ON ks.keyword = k3.keyword
      WHERE k3.window_hours = 3
        AND ks.keyword IS NULL
      ORDER BY k3.mention_count DESC
      LIMIT 30
    `);

    if (kwRows.length === 0) {
      const result = { topics: [] as Topic[] };
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

    // Step 2: 포스트 찾기 + 버스트 감지 병렬
    const [postKwResult, burstMap] = await Promise.all([
      app.pg.query<{ post_id: number; keywords: string[] }>(`
        SELECT ke.post_id, ke.keywords
        FROM keyword_extractions ke
        JOIN posts p ON p.id = ke.post_id
        WHERE p.scraped_at > NOW() - INTERVAL '6 hours'
          AND ke.keywords && $1::text[]
      `, [topKeywords]),
      detectBursts(app.pg).catch(() => new Map<string, number>()),
    ]);

    const postKwRows = postKwResult.rows;
    if (postKwRows.length === 0) {
      const result = { topics: [] as Topic[] };
      topicsCache.set('topics', result);
      return reply.send(result);
    }

    // Step 3: 포스트 상세 + 클러스터 + 스코어
    const postIds = postKwRows.map(r => r.post_id);
    const [postsResult, clusterResult, scoresResult] = await Promise.all([
      app.pg.query<{
        id: number; title: string; source_key: string;
        source_name: string; category: string | null; view_count: number;
        thumbnail: string | null;
      }>(`SELECT id, title, source_key, source_name, category, view_count, thumbnail
          FROM posts WHERE id = ANY($1::int[])`, [postIds]),
      app.pg.query<{ post_id: number; cluster_id: number }>(
        `SELECT post_id, cluster_id FROM post_cluster_members WHERE post_id = ANY($1::int[])`, [postIds]),
      app.pg.query<{ post_id: number; trend_score: number }>(
        `SELECT post_id, trend_score FROM post_scores WHERE post_id = ANY($1::int[])`, [postIds]),
    ]);

    const postMap = new Map(postsResult.rows.map(p => [p.id, p]));
    const postCluster = new Map(clusterResult.rows.map(c => [c.post_id, c.cluster_id]));
    const postScore = new Map(scoresResult.rows.map(s => [s.post_id, s.trend_score]));
    const postKeywords = new Map(postKwRows.map(pk => [pk.post_id, pk.keywords]));

    // Step 4: Union-Find 토픽 그룹핑
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

    const clusterPosts = new Map<number, number[]>();
    for (const [pid, cid] of postCluster) {
      const arr = clusterPosts.get(cid) ?? [];
      arr.push(pid);
      clusterPosts.set(cid, arr);
    }
    for (const members of clusterPosts.values()) {
      for (let i = 1; i < members.length; i++) union(members[0], members[i]);
    }

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
    for (const members of keywordPosts.values()) {
      for (let i = 1; i < members.length; i++) union(members[0], members[i]);
    }

    // Step 5: 그룹별 토픽 조립
    const groups = new Map<number, number[]>();
    for (const pid of postIds) {
      const root = find(pid);
      const arr = groups.get(root) ?? [];
      arr.push(pid);
      groups.set(root, arr);
    }

    const { rows: sigRows } = await app.pg.query<{
      keyword: string; convergence_score: number;
    }>(`SELECT keyword, convergence_score FROM trend_signals
        WHERE expires_at > NOW() AND convergence_score > 0`);
    const signalMap = new Map(sigRows.map(s => [s.keyword, s.convergence_score]));

    const topics: Topic[] = [];

    for (const [, memberIds] of groups) {
      if (memberIds.length < 2) continue;

      const kwFreq = new Map<string, number>();
      const channels = new Set<string>();
      let weightedNewsScore = 0;
      let communityCount = 0;
      const sourceMap = new Map<string, string>(); // key → name

      for (const pid of memberIds) {
        const post = postMap.get(pid);
        if (!post) continue;
        const ch = categoryToChannel(post.category);
        channels.add(ch);
        if (['news', 'press', 'government'].includes(post.category ?? '')) {
          weightedNewsScore += getSourceWeight(post.source_key);
        }
        if (ch === '커뮤니티') communityCount++;
        sourceMap.set(post.source_key, post.source_name);

        const kws = postKeywords.get(pid) ?? [];
        for (const kw of kws) {
          if (topKwSet.has(kw)) kwFreq.set(kw, (kwFreq.get(kw) ?? 0) + 1);
        }
      }

      const sortedKws = [...kwFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([kw]) => kw);

      if (sortedKws.length === 0) continue;

      const rankedPosts = memberIds
        .map(pid => ({ pid, score: postScore.get(pid) ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const representativePosts: TopicPost[] = rankedPosts
        .map(({ pid }) => {
          const p = postMap.get(pid);
          if (!p) return null;
          return { id: p.id, title: p.title, sourceKey: p.source_key, sourceName: p.source_name, thumbnail: p.thumbnail ?? null };
        })
        .filter((p): p is TopicPost => p !== null);

      const maxMomentum = Math.max(...sortedKws.map(kw => keywordMomentum.get(kw) ?? 1.0));
      const maxConvergence = Math.max(0, ...sortedKws.map(kw => signalMap.get(kw) ?? 0));
      const maxBurst = Math.max(0, ...sortedKws.map(kw => burstMap.get(kw) ?? 0));

      // 뉴스 기사 제목 우선
      const newsPost = rankedPosts.find(({ pid }) => {
        const p = postMap.get(pid);
        return p && ['news', 'press', 'government'].includes(p.category ?? '');
      });
      const headline = (newsPost ? postMap.get(newsPost.pid)?.title : undefined)
        ?? representativePosts[0]?.title
        ?? sortedKws[0];

      const channelArr = [...channels];

      // 통합 스코어 (다음 포커스 스타일 가중 평균)
      const isBreaking = maxBurst > 3.0;
      const communitySignal = Math.min(communityCount / 5, 1.0);
      const newsSignal = Math.min(weightedNewsScore / 3.0, 1.0);
      const burstSignal = Math.min(maxBurst / 5, 1.0);
      const convergenceSignal = Math.min(maxConvergence / 20, 1.0);

      const wNews = isBreaking ? 0.35 : 0.25;
      const wCommunity = isBreaking ? 0.20 : 0.30;
      const wBurst = 0.25;
      const wConvergence = 0.20;

      const unifiedScore = (
        communitySignal * wCommunity +
        newsSignal * wNews +
        burstSignal * wBurst +
        convergenceSignal * wConvergence
      ) * Math.log2(memberIds.length + 1) * maxMomentum;

      // 소스 목록: 가중치 내림차순 정렬
      const sources: TopicSource[] = [...sourceMap.entries()]
        .map(([key, name]) => ({ key, name, w: getSourceWeight(key) }))
        .sort((a, b) => b.w - a.w)
        .map(({ key, name }) => ({ key, name }));

      // 대표 썸네일: 첫 번째 thumbnail이 있는 representativePost
      const thumbnail = representativePosts.find(p => p.thumbnail)?.thumbnail ?? null;

      topics.push({
        id: hashKeywords(sortedKws),
        headline,
        keywords: sortedKws,
        channels: channelArr,
        postCount: memberIds.length,
        momentum: classifyMomentum(maxMomentum),
        momentumValue: Math.round(maxMomentum * 100) / 100,
        convergenceScore: maxConvergence,
        unifiedScore: Math.round(unifiedScore * 1000) / 1000,
        burstScore: maxBurst,
        rank: 0,
        previousRank: null,
        changeType: 'new',
        changeAmount: 0,
        confidence: classifyConfidence(channelArr, maxConvergence),
        representativePosts,
        thumbnail,
        sources,
        sourceCount: sources.length,
        summaryHeadline: null,
        summaryBody: null,
      });
    }

    // 통합 스코어로 정렬
    topics.sort((a, b) => b.unifiedScore - a.unifiedScore);
    const finalTopics = topics.slice(0, 12);

    // 랭킹 번호 부여
    for (let i = 0; i < finalTopics.length; i++) {
      finalTopics[i].rank = i + 1;
    }

    // 위치변동 계산: 이전 랭킹 조회
    const { rows: prevRanks } = await app.pg.query<{
      keyword: string; rank: number;
    }>(`
      SELECT DISTINCT ON (keyword) keyword, rank
      FROM trend_rankings
      WHERE calculated_at > NOW() - INTERVAL '2 hours'
        AND calculated_at < NOW() - INTERVAL '5 minutes'
      ORDER BY keyword, calculated_at DESC
    `);
    const prevRankMap = new Map(prevRanks.map(r => [r.keyword, r.rank]));

    for (const topic of finalTopics) {
      const prevRank = topic.keywords.reduce<number | null>((best, kw) => {
        const prev = prevRankMap.get(kw);
        if (prev === undefined) return best;
        return best === null ? prev : Math.min(best, prev);
      }, null);

      topic.previousRank = prevRank;
      if (prevRank === null) {
        topic.changeType = 'new';
        topic.changeAmount = 0;
      } else if (prevRank > topic.rank) {
        topic.changeType = 'up';
        topic.changeAmount = prevRank - topic.rank;
      } else if (prevRank < topic.rank) {
        topic.changeType = 'down';
        topic.changeAmount = topic.rank - prevRank;
      } else {
        topic.changeType = 'same';
        topic.changeAmount = 0;
      }
    }

    // AI 브리핑 요약 생성 (캐시 덕분에 60초에 1회만 호출)
    try {
      const summaryInputs = finalTopics.map(t => ({
        channel: t.channels[0] ?? '기타',
        keywords: t.keywords,
        postTitles: t.representativePosts.map(p => p.title),
      }));
      const summaries = await summarizeTopicsBatch(summaryInputs);
      for (let i = 0; i < finalTopics.length; i++) {
        const s = summaries[i];
        if (s) {
          finalTopics[i].summaryHeadline = s.headline;
          finalTopics[i].summaryBody = s.body;
        }
      }
    } catch {
      // 요약 실패해도 토픽 자체는 반환
      console.error('[topics] summary generation failed, continuing without summaries');
    }

    // 현재 랭킹 저장 (위치변동 추적용)
    if (finalTopics.length > 0) {
      const rankValues: string[] = [];
      const rankParams: unknown[] = [];
      for (const topic of finalTopics) {
        for (const kw of topic.keywords) {
          const idx = rankParams.length;
          rankValues.push(`($${idx + 1}, $${idx + 2}, $${idx + 3})`);
          rankParams.push(kw, topic.rank, topic.unifiedScore);
        }
      }
      await app.pg.query(
        `INSERT INTO trend_rankings (keyword, rank, unified_score)
         VALUES ${rankValues.join(', ')}`,
        rankParams,
      ).catch(() => { /* 테이블 미생성 시 무시 */ });

      // 24시간 이전 데이터 정리
      await app.pg.query(
        `DELETE FROM trend_rankings WHERE calculated_at < NOW() - INTERVAL '24 hours'`,
      ).catch(() => {});
    }

    const result = { topics: finalTopics };
    topicsCache.set('topics', result);
    return reply.send(result);
  });

  // 미니 에디토리얼 최신 조회
  app.get('/api/mini-editorial/latest', async (_req, reply) => {
    const cached = editorialCache.get('mini-editorial');
    if (cached) return reply.send(cached);

    const { rows } = await app.pg.query<{
      id: number;
      briefing: string;
      keywords: string[];
      topic_count: number;
      created_at: string;
    }>(
      `SELECT id, briefing, keywords, topic_count, created_at
       FROM mini_editorials
       ORDER BY created_at DESC
       LIMIT 1`,
    );

    const result = rows[0] ?? null;
    if (result) editorialCache.set('mini-editorial', result);
    return reply.send(result);
  });
}
