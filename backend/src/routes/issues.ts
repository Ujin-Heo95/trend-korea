import type { FastifyInstance, FastifyReply } from 'fastify';
import { LRUCache } from '../cache/lru.js';
import type { IssueRankingRow } from '../db/types.js';

// 2026-04-12: TTL 600s → 60s.
//   루트 원인: worker(cron) 가 clearIssuesCache 를 호출해도 web 프로세스의 in-memory LRU 에
//   영향 없음(프로세스 분리). 따라서 web 은 TTL 만 의지해서 stale 해제함.
//   600s 로는 사용자가 최대 10분 stale 을 보고 있었음. 60s 로 하향 — 백엔드 DB 부하는
//   pipeline 10분 사이클 대비 10배 증가이지만 issue_rankings_materialized 단일 테이블 읽기라
//   미미. 재발 대비 상한 1분 보장.
const issuesCache = new LRUCache<unknown>(50, 60_000);
// version 엔드포인트는 독립 캐시 — 15초 TTL로 clearIssuesCache 누락 시에도 자동 복구
const versionCache = new LRUCache<unknown>(1, 15_000);

// ── 신선도 SLO ──
// 파이프라인 cron 10분 + 요약 tick(+2분) + 여유 3분. 이 값을 넘으면 stale 로 간주.
export const ISSUE_DATA_SLO_SECONDS = 900;

// 캐시 invalidation 텔레메트리 (재발 시 5분 내 진단을 위해 마지막 호출 사유 보관)
interface CacheTelemetry {
  last_clear_at: string | null;
  last_clear_reason: string | null;
}
const cacheTelemetry: CacheTelemetry = { last_clear_at: null, last_clear_reason: null };

export function getIssuesCacheTelemetry(): Readonly<CacheTelemetry> {
  return cacheTelemetry;
}

/** 외부에서 캐시 무효화 (요약 완료 후 호출). reason 은 디버깅 텔레메트리에 기록. */
export function clearIssuesCache(reason: string = 'unknown'): void {
  issuesCache.clear();
  versionCache.clear();
  cacheTelemetry.last_clear_at = new Date().toISOString();
  cacheTelemetry.last_clear_reason = reason;
}

type FreshnessSource = 'materialized' | 'live' | 'empty';

interface FreshnessMeta {
  calculated_at: string | null;
  data_age_seconds: number | null;
  slo_seconds: number;
  is_stale: boolean;
  source: FreshnessSource;
}

function buildFreshness(calculatedAt: string | null, source: FreshnessSource): FreshnessMeta {
  if (!calculatedAt) {
    return { calculated_at: null, data_age_seconds: null, slo_seconds: ISSUE_DATA_SLO_SECONDS, is_stale: true, source };
  }
  const ageMs = Date.now() - new Date(calculatedAt).getTime();
  const ageSec = Math.max(0, Math.round(ageMs / 1000));
  return {
    calculated_at: calculatedAt,
    data_age_seconds: ageSec,
    slo_seconds: ISSUE_DATA_SLO_SECONDS,
    is_stale: ageSec > ISSUE_DATA_SLO_SECONDS,
    source,
  };
}

function setFreshnessHeaders(reply: FastifyReply, freshness: FreshnessMeta): void {
  if (freshness.data_age_seconds !== null) {
    reply.header('x-data-age-seconds', String(freshness.data_age_seconds));
  }
  reply.header('x-data-source', freshness.source);
  reply.header('x-data-stale', freshness.is_stale ? '1' : '0');
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

// TD-006 안전망: Gemini 요약이 아직 생성되지 않은 새 이슈에 rule-based summary를 채움.
// Tick 분리로 aggregateIssues(:00) → summarizeAndUpdateIssues(+2m) 사이 ~2분 갭 동안
// 사용자가 빈 summary를 보지 않도록 보장. summarizeAndUpdateIssues가 돌면 덮어쓰기됨.
function isEmptySummary(s: string | null | undefined): boolean {
  if (!s) return true;
  return s.startsWith('[fallback]');
}

function ruleBasedSummary(title: string, topPosts: readonly { title: string }[]): string {
  const lead = topPosts[0]?.title?.trim();
  if (!lead || lead === title) {
    return `${title.slice(0, 80)} — 관련 보도 ${topPosts.length}건`;
  }
  const clipped = lead.length > 80 ? `${lead.slice(0, 80)}…` : lead;
  return `${title} — ${clipped}`;
}

interface ResponseIssueLike {
  title: string;
  summary: string | null;
  news_posts: readonly { title: string }[];
  community_posts: readonly { title: string }[];
}

function fillRuleBasedIfEmpty<T extends ResponseIssueLike>(issue: T): T {
  if (!isEmptySummary(issue.summary)) return issue;
  // 안전망은 news_posts 만 사용 — 뉴스 앵커 없는 이슈는 애초에 노출 금지 정책 (issueAggregator scoreAndFilter)
  return { ...issue, summary: ruleBasedSummary(issue.title, issue.news_posts) };
}

interface MaterializedResponse {
  issues?: ResponseIssueLike[];
}

function applySafetyNet(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as MaterializedResponse;
  if (!Array.isArray(p.issues)) return payload;
  // 뉴스 앵커 없는 이슈는 기본적으로 응답에서 제외 — DB stale 데이터 누출 차단.
  // 다만 2026-04-12 사고: news 스크래퍼 집단 DNS/타임아웃 실패로 posts 테이블에 news 가
  // 부재할 때 필터가 전체 이슈를 드롭 → 사용자 빈 화면. graceful degrade:
  // "필터 결과가 0건이고 원본은 존재" 이면 필터 우회하여 community/video anchor 라도 노출.
  const filtered = p.issues.filter(it => it.news_posts.length > 0);
  if (filtered.length === 0 && p.issues.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[issues] safety-net degraded: ${p.issues.length} issues without news anchor — falling back to all`);
    return { ...p, issues: p.issues.map(fillRuleBasedIfEmpty) };
  }
  return { ...p, issues: filtered.map(fillRuleBasedIfEmpty) };
}

// SNS trend source keys
const SNS_SOURCES = new Set([
  'apify_x_trending', 'apify_instagram', 'apify_tiktok',
]);

export async function issueRoutes(app: FastifyInstance): Promise<void> {
  // 경량 버전 체크 — 프론트엔드가 30초마다 폴링하여 갱신 감지
  // 독립 캐시(15초 TTL) — clearIssuesCache 누락 시에도 자동 복구
  app.get('/api/issues/version', async () => {
    const cacheKey = 'issues-version';
    const cached = versionCache.get(cacheKey);
    if (cached) return cached;

    const { rows } = await app.pg.query<{ calculated_at: string | null }>(
      `SELECT MAX(calculated_at)::text AS calculated_at FROM issue_rankings WHERE expires_at > NOW()`,
    );
    const result = { calculated_at: rows[0]?.calculated_at ?? null };
    versionCache.set(cacheKey, result);
    return result;
  });

  const WINDOW_MAP: Record<string, number> = { '6h': 6, '12h': 12, '24h': 24 };

  app.get<{ Querystring: { page?: number; limit?: number; cursor_score?: number; cursor_id?: number; window?: string } }>(
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
            window: { type: 'string', enum: ['6h', '12h', '24h'], default: '12h' },
          },
        },
      },
    },
    async (req, reply) => {
      const limit = req.query.limit ?? 20;
      const page = req.query.page ?? 1;
      const cursorScore = req.query.cursor_score;
      const cursorId = req.query.cursor_id;
      const windowParam = req.query.window ?? '12h';
      const windowHours = WINDOW_MAP[windowParam] ?? 12;
      const offset = (page - 1) * limit;

      // 캐시는 페이로드 + 데이터 소스 식별만 보관. freshness 는 매 요청마다 NOW() 기준 재계산
      // (캐시된 calculated_at 자체는 stale 되지 않으므로 시간 흐름에 따른 SLO 판단이 가능)
      type CachedPayload = { data: unknown; calculatedAt: string | null; source: FreshnessSource };
      const cacheKey = `issues:${windowParam}:${page}:${limit}`;
      const cached = issuesCache.get(cacheKey) as CachedPayload | undefined;
      if (cached) {
        const freshness = buildFreshness(cached.calculatedAt, cached.source);
        setFreshnessHeaders(reply, freshness);
        return { ...(cached.data as object), freshness };
      }

      // Try materialized response first (pre-computed, fastest path)
      // 20분 이상 된 materialized는 무시 → fallback live query로 우회 (stale 방지)
      if (limit === 20) {
        const { rows: matRows } = await app.pg.query<{ response_json: unknown; calculated_at: string }>(
          `SELECT response_json, calculated_at::text AS calculated_at FROM issue_rankings_materialized
            WHERE page = $1 AND page_size = $2 AND window_hours = $3
              AND calculated_at > NOW() - INTERVAL '20 minutes'`,
          [page, 20, windowHours],
        );
        if (matRows.length > 0 && matRows[0].response_json) {
          const data = applySafetyNet(matRows[0].response_json);
          const calculatedAt = matRows[0].calculated_at;
          issuesCache.set(cacheKey, { data, calculatedAt, source: 'materialized' } satisfies CachedPayload);
          const freshness = buildFreshness(calculatedAt, 'materialized');
          setFreshnessHeaders(reply, freshness);
          return { ...(data as object), freshness };
        }
      }

      // Fallback: compute from issue_rankings (non-standard page sizes or empty materialized)
      // Cursor-based pagination when cursor_score + cursor_id provided
      // TD-006: summary IS NOT NULL 필터 제거. tick 분리 후 새 이슈는 잠시 NULL일 수 있고
      // 응답 빌드 시 rule-based 안전망(fillRuleBasedIfEmpty)으로 채워짐.
      const useCursor = cursorScore != null && cursorId != null;
      const [issueResult, countResult] = await Promise.all([
        useCursor
          ? app.pg.query<IssueRankingRow>(
              `SELECT * FROM issue_rankings
               WHERE expires_at > NOW() AND window_hours = $4
                 AND (issue_score, id) < ($2, $3)
               ORDER BY issue_score DESC, id DESC
               LIMIT $1`,
              [limit, cursorScore, cursorId, windowHours],
            )
          : app.pg.query<IssueRankingRow>(
              `SELECT * FROM issue_rankings
               WHERE expires_at > NOW() AND window_hours = $3
               ORDER BY issue_score DESC
               LIMIT $1 OFFSET $2`,
              [limit, offset, windowHours],
            ),
        app.pg.query<{ total: number }>(
          `SELECT COUNT(*)::int AS total FROM issue_rankings WHERE expires_at > NOW() AND window_hours = $1`,
          [windowHours],
        ),
      ]);

      const issues = issueResult.rows;
      if (issues.length === 0) {
        const empty = { issues: [], total: 0, calculated_at: null };
        issuesCache.set(cacheKey, { data: empty, calculatedAt: null, source: 'empty' } satisfies CachedPayload);
        const freshness = buildFreshness(null, 'empty');
        setFreshnessHeaders(reply, freshness);
        return { ...empty, freshness };
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
      // 안전망 일원화: news_posts 가 비는 이슈는 드롭 + 남은 이슈는 rule-based 로 채움.
      // 2026-04-12 graceful degrade: 필터 결과가 0건이면 전체를 그대로 반환 — 뉴스 스크래퍼
      // 집단 장애 상황에서도 community/video 앵커 이슈라도 사용자에게 보여준다.
      const strictFiltered = responseIssues.filter(it => it.news_posts.length > 0);
      const filteredIssues = (strictFiltered.length === 0 && responseIssues.length > 0
        ? responseIssues
        : strictFiltered
      ).map(fillRuleBasedIfEmpty);
      if (strictFiltered.length === 0 && responseIssues.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[issues] live safety-net degraded: ${responseIssues.length} issues without news anchor`);
      }

      // next_cursor for keyset pagination
      const lastIssue = issues[issues.length - 1];
      const nextCursor = lastIssue && filteredIssues.length === limit
        ? { cursor_score: lastIssue.issue_score, cursor_id: lastIssue.id }
        : null;

      const calculatedAt = (issues[0]?.calculated_at as string | undefined) ?? null;
      const result = {
        issues: filteredIssues,
        total: countResult.rows[0].total,
        calculated_at: calculatedAt,
        next_cursor: nextCursor,
      };
      issuesCache.set(cacheKey, { data: result, calculatedAt, source: 'live' } satisfies CachedPayload);
      const freshness = buildFreshness(calculatedAt, 'live');
      setFreshnessHeaders(reply, freshness);
      return { ...result, freshness };
    },
  );
}
