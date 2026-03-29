import axios from 'axios';
import type { Pool } from 'pg';
import { config } from '../config/index.js';

interface TrendArticle {
  readonly title: string;
  readonly url: string;
  readonly source: string;
}

interface GoogleTrendPost {
  readonly id: number;
  readonly title: string;
  readonly url: string;
  readonly view_count: number;
  readonly metadata: {
    keyword?: string;
    traffic?: string;
    trafficNum?: number;
    articles?: TrendArticle[];
  } | null;
}

interface NaverDatalabRatio {
  readonly period: string;
  readonly ratio: number;
}

interface NaverDatalabResult {
  readonly title: string;
  readonly keywords: readonly string[];
  readonly data: readonly NaverDatalabRatio[];
}

interface NaverDatalabResponse {
  readonly results: readonly NaverDatalabResult[];
}

interface TrendSignal {
  readonly keyword: string;
  readonly googleTraffic: string;
  readonly googleTrafficNum: number;
  readonly googlePostId: number;
  readonly naverRecent: number | null;
  readonly naverPrevious: number | null;
  readonly naverChangePct: number | null;
  readonly naverTrendData: NaverDatalabRatio[] | null;
  readonly communityMentions: number;
  readonly communitySources: readonly string[];
  readonly convergenceScore: number;
  readonly signalType: 'confirmed' | 'google_only';
  readonly contextTitle: string | null;
  readonly relatedPostIds: readonly number[];
}

// ── 키워드 추출 ──────────────────────────────────────

function extractKeyword(post: GoogleTrendPost): string {
  if (post.metadata?.keyword) return post.metadata.keyword;

  // 폴백: 제목에서 파싱 "키워드 (트래픽) — 뉴스제목" 또는 "키워드 (검색량 트래픽)"
  const title = post.title;
  const parenIdx = title.indexOf('(');
  if (parenIdx > 0) return title.slice(0, parenIdx).trim();
  const dashIdx = title.indexOf('—');
  if (dashIdx > 0) return title.slice(0, dashIdx).trim();
  return title.trim();
}

function extractTrafficNum(post: GoogleTrendPost): number {
  if (post.metadata?.trafficNum) return post.metadata.trafficNum;
  return post.view_count ?? 0;
}

function extractTraffic(post: GoogleTrendPost): string {
  if (post.metadata?.traffic) return post.metadata.traffic;
  return '';
}

// ── Naver DataLab 배치 호출 ──────────────────────────

interface NaverResult {
  readonly recent: number;
  readonly previous: number;
  readonly changePct: number;
  readonly trendData: NaverDatalabRatio[];
}

async function queryNaverDatalab(
  keywords: readonly string[],
): Promise<ReadonlyMap<string, NaverResult>> {
  const results = new Map<string, NaverResult>();

  if (!config.naverClientId || !config.naverClientSecret) return results;
  if (keywords.length === 0) return results;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  // 5개씩 그룹핑 (Naver API 제한: 요청당 최대 5개 그룹)
  const batches: string[][] = [];
  for (let i = 0; i < keywords.length; i += 5) {
    batches.push(keywords.slice(i, i + 5) as string[]);
  }

  for (const batch of batches) {
    try {
      const keywordGroups = batch.map(kw => ({
        groupName: kw,
        keywords: [kw],
      }));

      const { data } = await axios.post<NaverDatalabResponse>(
        'https://openapi.naver.com/v1/datalab/search',
        {
          startDate: fmtDate(startDate),
          endDate: fmtDate(endDate),
          timeUnit: 'date',
          keywordGroups,
        },
        {
          headers: {
            'X-Naver-Client-Id': config.naverClientId,
            'X-Naver-Client-Secret': config.naverClientSecret,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      for (const result of data?.results ?? []) {
        if (result.data.length < 4) continue;

        const recentDays = result.data.slice(-3);
        const previousDays = result.data.slice(-7, -3);

        const recent = recentDays.reduce((s, d) => s + d.ratio, 0) / recentDays.length;
        const previous = previousDays.length > 0
          ? previousDays.reduce((s, d) => s + d.ratio, 0) / previousDays.length
          : 0;
        const changePct = previous > 0 ? Math.round(((recent - previous) / previous) * 100) : 0;

        results.set(result.title, {
          recent: Math.round(recent),
          previous: Math.round(previous),
          changePct,
          trendData: result.data.map(d => ({ period: d.period, ratio: d.ratio })),
        });
      }
    } catch (err) {
      console.error('[cross-validate] naver batch error:', err instanceof Error ? err.message : String(err));
    }

    // rate limit 대응: 배치 간 500ms 대기
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

// ── 커뮤니티 매칭 ────────────────────────────────────

interface CommunityMatch {
  readonly mentions: number;
  readonly sources: readonly string[];
  readonly postIds: readonly number[];
}

async function findCommunityMentions(
  pool: Pool,
  keywords: readonly string[],
): Promise<ReadonlyMap<string, CommunityMatch>> {
  const results = new Map<string, CommunityMatch>();
  if (keywords.length === 0) return results;

  // 최근 6시간 커뮤니티 포스트 (trend 카테고리 제외)
  const { rows } = await pool.query<{ id: number; title: string; source_key: string }>(
    `SELECT id, title, source_key FROM posts
     WHERE scraped_at > NOW() - INTERVAL '6 hours'
       AND source_key NOT IN ('google_trends', 'naver_datalab')
     ORDER BY scraped_at DESC
     LIMIT 2000`,
  );

  for (const keyword of keywords) {
    if (keyword.length < 2) continue;

    const matchedSources = new Set<string>();
    const matchedPostIds: number[] = [];
    for (const row of rows) {
      if (row.title.includes(keyword)) {
        matchedSources.add(row.source_key);
        if (matchedPostIds.length < 5) matchedPostIds.push(row.id);
      }
    }

    if (matchedSources.size > 0) {
      results.set(keyword, {
        mentions: matchedSources.size,
        sources: [...matchedSources],
        postIds: matchedPostIds,
      });
    }
  }

  return results;
}

// ── keyword_extractions 기반 관련 게시글 조회 ────────

async function findKeywordRelatedPosts(
  pool: Pool,
  keywords: readonly string[],
): Promise<ReadonlyMap<string, readonly number[]>> {
  const results = new Map<string, readonly number[]>();
  if (keywords.length === 0) return results;

  for (const keyword of keywords) {
    try {
      const { rows } = await pool.query<{ post_id: number }>(
        `SELECT ke.post_id FROM keyword_extractions ke
         JOIN posts p ON p.id = ke.post_id
         WHERE $1 = ANY(ke.keywords)
           AND p.scraped_at > NOW() - INTERVAL '24 hours'
           AND p.source_key != 'google_trends'
         ORDER BY p.scraped_at DESC
         LIMIT 10`,
        [keyword],
      );
      if (rows.length > 0) {
        results.set(keyword, rows.map(r => r.post_id));
      }
    } catch {
      // GIN index may not exist yet on first run
    }
  }

  return results;
}

// ── Convergence Score 계산 ───────────────────────────

function computeConvergenceScore(
  trafficNum: number,
  naverData: { changePct: number } | null,
  communityMentions: number,
): number {
  const googleScore = Math.log1p(trafficNum);

  let naverMultiplier: number;
  if (naverData && naverData.changePct > 0) {
    naverMultiplier = 1.5 + Math.min(naverData.changePct / 100, 1.0);
  } else if (naverData) {
    naverMultiplier = 1.0;
  } else {
    naverMultiplier = 0.8;
  }

  const communityMultiplier = 1.0 + Math.min(communityMentions * 0.15, 0.75);

  return Math.round(googleScore * naverMultiplier * communityMultiplier * 100) / 100;
}

// ── 메인 교차 검증 함수 ──────────────────────────────

export async function crossValidate(pool: Pool): Promise<number> {
  const startTime = Date.now();

  // 1. 최근 6시간 Google Trends 포스트 조회
  const { rows: googlePosts } = await pool.query<GoogleTrendPost>(
    `SELECT id, title, url, view_count, metadata
     FROM posts
     WHERE source_key = 'google_trends'
       AND scraped_at > NOW() - INTERVAL '6 hours'
     ORDER BY scraped_at DESC`,
  );

  if (googlePosts.length === 0) {
    console.log('[cross-validate] no google_trends posts in last 6h, skipping');
    return 0;
  }

  // 2. 고유 키워드 추출 + 오늘 이미 검증된 키워드 스킵
  const keywordPostMap = new Map<string, GoogleTrendPost>();
  for (const post of googlePosts) {
    const keyword = extractKeyword(post);
    if (keyword && !keywordPostMap.has(keyword)) {
      keywordPostMap.set(keyword, post);
    }
  }

  const { rows: existing } = await pool.query<{ keyword: string }>(
    `SELECT keyword FROM trend_signals
     WHERE detected_date = CURRENT_DATE`,
  );
  const existingKeywords = new Set(existing.map(r => r.keyword));

  const newKeywords = [...keywordPostMap.keys()].filter(k => !existingKeywords.has(k));
  if (newKeywords.length === 0) {
    console.log('[cross-validate] all keywords already validated today');
    return 0;
  }

  // 3. Naver DataLab 교차 검증
  const naverResults = await queryNaverDatalab(newKeywords);

  // 4. 커뮤니티 매칭
  const communityResults = await findCommunityMentions(pool, newKeywords);

  // 5. keyword_extractions 기반 관련 게시글 조회
  const keywordRelated = await findKeywordRelatedPosts(pool, newKeywords);

  // 6. 시그널 생성 + UPSERT
  const signals: TrendSignal[] = newKeywords.map(keyword => {
    const post = keywordPostMap.get(keyword)!;
    const naver = naverResults.get(keyword) ?? null;
    const community = communityResults.get(keyword) ?? { mentions: 0, sources: [], postIds: [] };
    const trafficNum = extractTrafficNum(post);

    const convergenceScore = computeConvergenceScore(trafficNum, naver, community.mentions);
    const signalType = naver && naver.changePct > 0 ? 'confirmed' as const : 'google_only' as const;

    // 관련 게시글 ID 합산 (커뮤니티 + keyword_extractions, 중복 제거, 최대 5개)
    const kePostIds = keywordRelated.get(keyword) ?? [];
    const allPostIds = [...new Set([...community.postIds, ...kePostIds])].slice(0, 5);

    // context_title: Google Trends 원본 기사 제목 → 폴백: 첫 번째 매칭 게시글
    const articles = post.metadata?.articles ?? [];
    const contextTitle = articles[0]?.title ?? null;

    return {
      keyword,
      googleTraffic: extractTraffic(post),
      googleTrafficNum: trafficNum,
      googlePostId: post.id,
      naverRecent: naver?.recent ?? null,
      naverPrevious: naver?.previous ?? null,
      naverChangePct: naver?.changePct ?? null,
      naverTrendData: naver?.trendData ?? null,
      communityMentions: community.mentions,
      communitySources: community.sources,
      convergenceScore,
      signalType,
      contextTitle,
      relatedPostIds: allPostIds,
    };
  });

  let upserted = 0;
  for (const s of signals) {
    try {
      await pool.query(
        `INSERT INTO trend_signals (
           keyword, google_traffic, google_traffic_num, google_post_id,
           naver_recent, naver_previous, naver_change_pct,
           community_mentions, community_sources,
           convergence_score, signal_type,
           context_title, related_post_ids, naver_trend_data
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (keyword, detected_date)
         DO UPDATE SET
           google_traffic = EXCLUDED.google_traffic,
           google_traffic_num = EXCLUDED.google_traffic_num,
           google_post_id = EXCLUDED.google_post_id,
           naver_recent = EXCLUDED.naver_recent,
           naver_previous = EXCLUDED.naver_previous,
           naver_change_pct = EXCLUDED.naver_change_pct,
           community_mentions = EXCLUDED.community_mentions,
           community_sources = EXCLUDED.community_sources,
           convergence_score = EXCLUDED.convergence_score,
           signal_type = EXCLUDED.signal_type,
           context_title = EXCLUDED.context_title,
           related_post_ids = EXCLUDED.related_post_ids,
           naver_trend_data = EXCLUDED.naver_trend_data`,
        [
          s.keyword, s.googleTraffic, s.googleTrafficNum, s.googlePostId,
          s.naverRecent, s.naverPrevious, s.naverChangePct,
          s.communityMentions, s.communitySources,
          s.convergenceScore, s.signalType,
          s.contextTitle, s.relatedPostIds,
          s.naverTrendData ? JSON.stringify(s.naverTrendData) : null,
        ],
      );
      upserted++;
    } catch (err) {
      console.error(`[cross-validate] upsert error for "${s.keyword}":`, err instanceof Error ? err.message : String(err));
    }
  }

  const elapsed = Date.now() - startTime;
  const confirmed = signals.filter(s => s.signalType === 'confirmed').length;
  console.log(`[cross-validate] ${upserted} signals (${confirmed} confirmed) in ${elapsed}ms`);

  return upserted;
}
