import type { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import { notifyPipelineWarning } from './discord.js';
import { buildKeywordIndex, matchPostToKeywords, computeTrendSignalBonus } from './trendSignals.js';
import { getChannel, SCORED_CATEGORIES_SQL } from './scoring-weights.js';
import { cosineSimilarity as embeddingCosine } from './embedding.js';
import { getScoringConfig } from './scoringConfig.js';
import { extractEntities, entityIntersection } from './entityExtractor.js';
import {
  computePairHash,
  recordPendingMergeDecisions,
  loadRecentDecisions,
  type PendingPairInput,
} from './pendingMergeDecisions.js';

// ─── Types ───

interface ScoredPost {
  readonly id: number;
  readonly sourceKey: string;
  readonly category: string | null;
  readonly title: string;
  readonly contentSnippet: string | null;
  readonly thumbnail: string | null;
  readonly trendScore: number;
  readonly clusterId: number | null;
  readonly clusterBonus: number;
  readonly scrapedAt: Date;
}

export interface IssueGroup {
  readonly clusterIds: Set<number>;
  readonly standalonePostIds: Set<number>;
  readonly newsPosts: readonly ScoredPost[];
  readonly communityPosts: readonly ScoredPost[];
  readonly videoPosts: readonly ScoredPost[];
  readonly matchedKeywords: readonly string[];
  readonly trendSignalScore: number;
}

export type { ScoredPost };

interface ScoredIssue {
  readonly group: IssueGroup;
  readonly issueScore: number;
  readonly momentumScore: number;
}

interface IssueRow {
  readonly title: string;
  readonly summary: string | null;
  readonly categoryLabel: string | null;
  readonly issueScore: number;
  readonly newsScore: number;
  readonly communityScore: number;
  readonly videoScore: number;
  readonly trendSignalScore: number;
  readonly momentumScore: number;
  readonly newsPostCount: number;
  readonly communityPostCount: number;
  readonly videoPostCount: number;
  readonly representativeThumbnail: string | null;
  readonly clusterIds: readonly number[];
  readonly standalonePostIds: readonly number[];
  readonly matchedTrendKeywords: readonly string[];
  readonly stableId: string;
}

// ─── Constants ───

const DEFAULT_ISSUE_WINDOW_HOURS = 12;
const DEFAULT_MAX_ISSUES = 30;
const DEFAULT_NEWS_WEIGHT = 1.0;
const DEFAULT_COMMUNITY_WEIGHT = 0.6;
const DEFAULT_VIDEO_NEWS_WEIGHT = 1.0;
const DEFAULT_VIDEO_GENERAL_WEIGHT = 0.4;
const DEFAULT_TREND_SIGNAL_WEIGHT = 0.4;
const DEFAULT_DIMINISHING_K = 0.7;
const DEFAULT_MOMENTUM_WEIGHT = 0.4;
const DEFAULT_MOMENTUM_PENALTY_MIN = 0.7;
const DEFAULT_COMMUNITY_BOOST = 0.3;
const DEFAULT_DIVERSITY_CAP = 2.5;
const DEFAULT_CROSS_SOURCE_2 = 0.1;
const DEFAULT_CROSS_SOURCE_3 = 0.2;
const DEFAULT_BREAKING_KW_HALFLIFE = 30;
const DEFAULT_BREAKING_KW_MAX_BOOST = 3.0;

// Phase 2/3 — IDF 기반 병합 판정 + 임베딩 cosine 게이트
// 키워드 공유 카운트 대신, 공유 키워드의 IDF 합이 임계값을 넘어야 union 허용.
// 광범위 명사("정부","경제","한국")는 keyword_idf 테이블에서 낮은 idf를 받아 자동으로 제외됨.
const DEFAULT_MERGE_IDF_THRESHOLD = 3.5;
// 임베딩 cosine 게이트: IDF 통과 후 양쪽 임베딩이 모두 있을 때 의미 유사도 검증.
// 한쪽이라도 임베딩이 없으면 IDF만으로 결정 (콜드 스타트 friendly).
const DEFAULT_MERGE_COS_THRESHOLD = 0.78;
// IDF 캐시 미스 시 폴백값 — 신규/희귀 키워드는 의미 있는 신호로 간주.
const IDF_FALLBACK = 2.5;
// Phase 4 — Entity-aware 게이트
// 양쪽 제목에서 추출한 entity Set이 모두 비어있지 않은데 교집합 0이면 다른 사건으로 판정.
// 양쪽 다 비어있는 borderline은 cos이 이 구간에 들면 Gemini arbiter에 위임.
const ARBITER_COS_LOW = 0.80;
const ARBITER_COS_HIGH = 0.88;

const NEWS_VIDEO_SOURCES = new Set([
  'youtube_sbs_news', 'youtube_ytn', 'youtube_mbc_news',
  'youtube_kbs_news', 'youtube_jtbc_news',
]);

interface IssueConfig {
  readonly issueWindowHours: number;
  readonly maxIssues: number;
  readonly newsWeight: number;
  readonly communityWeight: number;
  readonly videoNewsWeight: number;
  readonly videoGeneralWeight: number;
  readonly trendSignalWeight: number;
  readonly issueDedupThreshold: number;
  readonly containmentThreshold: number;
  readonly diminishingK: number;
  readonly momentumWeight: number;
  readonly momentumPenaltyMin: number;
  readonly communityBoost: number;
  readonly diversityCap: number;
  readonly crossSource2: number;
  readonly crossSource3: number;
  readonly breakingKwHalflife: number;
  readonly breakingKwMaxBoost: number;
  readonly mergeIdfThreshold: number;
  readonly mergeCosThreshold: number;
}

async function loadIssueConfig(): Promise<IssueConfig> {
  const config = getScoringConfig();
  const group = await config.getGroup('issue_aggregator');
  return {
    issueWindowHours: (group['ISSUE_WINDOW_HOURS'] as number) ?? DEFAULT_ISSUE_WINDOW_HOURS,
    maxIssues: (group['MAX_ISSUES'] as number) ?? DEFAULT_MAX_ISSUES,
    newsWeight: (group['NEWS_WEIGHT'] as number) ?? DEFAULT_NEWS_WEIGHT,
    communityWeight: (group['COMMUNITY_WEIGHT'] as number) ?? DEFAULT_COMMUNITY_WEIGHT,
    videoNewsWeight: (group['VIDEO_NEWS_WEIGHT'] as number) ?? DEFAULT_VIDEO_NEWS_WEIGHT,
    videoGeneralWeight: (group['VIDEO_GENERAL_WEIGHT'] as number) ?? DEFAULT_VIDEO_GENERAL_WEIGHT,
    trendSignalWeight: (group['TREND_SIGNAL_WEIGHT'] as number) ?? DEFAULT_TREND_SIGNAL_WEIGHT,
    issueDedupThreshold: (group['ISSUE_DEDUP_THRESHOLD'] as number) ?? 0.55,
    containmentThreshold: (group['CONTAINMENT_THRESHOLD'] as number) ?? 0.60,
    diminishingK: (group['DIMINISHING_K'] as number) ?? DEFAULT_DIMINISHING_K,
    momentumWeight: (group['MOMENTUM_WEIGHT'] as number) ?? DEFAULT_MOMENTUM_WEIGHT,
    momentumPenaltyMin: (group['MOMENTUM_PENALTY_MIN'] as number) ?? DEFAULT_MOMENTUM_PENALTY_MIN,
    communityBoost: (group['COMMUNITY_BOOST'] as number) ?? DEFAULT_COMMUNITY_BOOST,
    diversityCap: (group['DIVERSITY_CAP'] as number) ?? DEFAULT_DIVERSITY_CAP,
    crossSource2: (group['CROSS_SOURCE_2'] as number) ?? DEFAULT_CROSS_SOURCE_2,
    crossSource3: (group['CROSS_SOURCE_3'] as number) ?? DEFAULT_CROSS_SOURCE_3,
    breakingKwHalflife: (group['BREAKING_KW_HALFLIFE'] as number) ?? DEFAULT_BREAKING_KW_HALFLIFE,
    breakingKwMaxBoost: (group['BREAKING_KW_MAX_BOOST'] as number) ?? DEFAULT_BREAKING_KW_MAX_BOOST,
    mergeIdfThreshold: (group['MERGE_IDF_THRESHOLD'] as number) ?? DEFAULT_MERGE_IDF_THRESHOLD,
    mergeCosThreshold: (group['MERGE_COS_THRESHOLD'] as number) ?? DEFAULT_MERGE_COS_THRESHOLD,
  };
}

// ─── Stable ID ───

function computeStableId(clusterIds: readonly number[], standalonePostIds: readonly number[]): string {
  const key = [...clusterIds].sort().join(',') + '|' + [...standalonePostIds].sort().join(',');
  return createHash('md5').update(key).digest('hex').slice(0, 12);
}

// ─── Window Configuration ───

const ISSUE_WINDOWS = [6, 12, 24] as const;
type IssueWindow = (typeof ISSUE_WINDOWS)[number];

const WINDOW_TTL_MS: Record<IssueWindow, number> = {
  6: 2 * 60 * 60 * 1000,   // 2h — 빠른 회전
  12: 6 * 60 * 60 * 1000,  // 6h — 기존 기본값
  24: 6 * 60 * 60 * 1000,  // 6h
};

// ─── Main Entry Point ───

let isAggregating = false;
let aggregationStartedAt = 0;
const AGGREGATION_TIMEOUT_MS = 8 * 60_000; // 8분 타임아웃 (3개 윈도우)

/** 단일 윈도우 집계 (하위 호환) */
export async function aggregateIssues(pool: Pool): Promise<number> {
  return aggregateAllWindows(pool);
}

/** 모든 윈도우(6h/12h/24h) 순차 집계 */
export async function aggregateAllWindows(pool: Pool): Promise<number> {
  if (isAggregating) {
    const elapsed = Date.now() - aggregationStartedAt;
    if (elapsed < AGGREGATION_TIMEOUT_MS) {
      logger.warn({ elapsed: Math.round(elapsed / 1000) }, '[issueAggregator] skipping — previous run still active');
      return 0;
    }
    const msg = `[issueAggregator] stale lock force-released after ${Math.round(elapsed / 1000)}s`;
    logger.warn(msg);
    notifyPipelineWarning('issueAggregator', msg).catch(() => {});
    isAggregating = false;
  }
  isAggregating = true;
  aggregationStartedAt = Date.now();
  try {
    return await Promise.race([
      _aggregateAllWindows(pool),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('[issueAggregator] pipeline timeout after 7min')), 7 * 60_000),
      ),
    ]);
  } finally {
    isAggregating = false;
  }
}

async function _aggregateAllWindows(pool: Pool): Promise<number> {
  let total = 0;
  for (const windowHours of ISSUE_WINDOWS) {
    try {
      const count = await _aggregateIssues(pool, windowHours);
      total += count;
      logger.info(`[issueAggregator] window=${windowHours}h → ${count} issues`);
    } catch (err) {
      logger.error({ err, windowHours }, `[issueAggregator] window=${windowHours}h failed`);
      notifyPipelineWarning('issueAggregator', `window=${windowHours}h failed: ${err}`).catch(() => {});
    }
  }
  return total;
}

async function _aggregateIssues(pool: Pool, windowHours: IssueWindow = 12): Promise<number> {
  const cfg = await loadIssueConfig().catch((): IssueConfig => ({
    issueWindowHours: DEFAULT_ISSUE_WINDOW_HOURS,
    maxIssues: DEFAULT_MAX_ISSUES,
    newsWeight: DEFAULT_NEWS_WEIGHT,
    communityWeight: DEFAULT_COMMUNITY_WEIGHT,
    videoNewsWeight: DEFAULT_VIDEO_NEWS_WEIGHT,
    videoGeneralWeight: DEFAULT_VIDEO_GENERAL_WEIGHT,
    trendSignalWeight: DEFAULT_TREND_SIGNAL_WEIGHT,
    issueDedupThreshold: 0.55,
    containmentThreshold: 0.60,
    diminishingK: DEFAULT_DIMINISHING_K,
    momentumWeight: DEFAULT_MOMENTUM_WEIGHT,
    momentumPenaltyMin: DEFAULT_MOMENTUM_PENALTY_MIN,
    communityBoost: DEFAULT_COMMUNITY_BOOST,
    diversityCap: DEFAULT_DIVERSITY_CAP,
    crossSource2: DEFAULT_CROSS_SOURCE_2,
    crossSource3: DEFAULT_CROSS_SOURCE_3,
    breakingKwHalflife: DEFAULT_BREAKING_KW_HALFLIFE,
    breakingKwMaxBoost: DEFAULT_BREAKING_KW_MAX_BOOST,
    mergeIdfThreshold: DEFAULT_MERGE_IDF_THRESHOLD,
    mergeCosThreshold: DEFAULT_MERGE_COS_THRESHOLD,
  }));

  // Step 0.5: Adaptive window — 12h 윈도우만 적응형, 6h/24h는 고정
  let effectiveWindow: number = windowHours;
  if (windowHours === 12) {
    const { rows: [{ cnt }] } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM posts
       WHERE scraped_at > NOW() - INTERVAL '3 hours'
         AND COALESCE(category, '') IN ${SCORED_CATEGORIES_SQL}`,
    );
    const recentVolume = parseInt(cnt, 10);
    effectiveWindow = recentVolume > 200
      ? Math.max(8, cfg.issueWindowHours - 4)   // 고볼륨: 집중 윈도우
      : recentVolume < 50
        ? Math.min(18, cfg.issueWindowHours + 6) // 저볼륨(주말/야간): 확장
        : cfg.issueWindowHours;                  // 평상: 기본값(12h)
  }

  // Step 1: Fetch scored posts (now includes video)
  const posts = await fetchScoredPosts(pool, effectiveWindow);
  if (posts.length === 0) return 0;

  // Step 2: Build cluster-based groups
  const clusterGroups = buildClusterGroups(posts);

  // Step 3: Merge related clusters via trend keywords
  const mergedGroups = await mergeViaTrendKeywords(pool, clusterGroups, cfg);

  // Step 3.5: 임베딩 기반 이슈 중복제거 (v4 — bigram/IDF/containment/Gemini borderline 일체 제거)
  const finalGroups = deduplicateIssuesByEmbedding(mergedGroups);

  // Step 4: Filter and score (includes video)
  const scoredIssues = scoreAndFilter(finalGroups, cfg);

  // Step 5: Take top N
  const topIssues = scoredIssues.slice(0, cfg.maxIssues);

  // Step 6: Build issue rows with stable IDs (pre-computed scores)
  const issueRows = topIssues.map(si => buildIssueRow(si, cfg));

  // Step 7: Write to DB (delete old → insert new, atomic)
  return await writeIssueRankings(pool, issueRows, windowHours);
}

// ─── Step 1: Fetch Posts (now includes video) ───

async function fetchScoredPosts(pool: Pool, windowHours: number): Promise<ScoredPost[]> {
  const { rows } = await pool.query<{
    id: number; source_key: string; category: string | null;
    title: string; content_snippet: string | null; thumbnail: string | null;
    trend_score: number; cluster_id: number | null;
    cluster_bonus: number; scraped_at: Date;
  }>(`
    SELECT p.id, p.source_key, p.category, p.title, p.content_snippet, p.thumbnail,
           COALESCE(ps.trend_score, 0) AS trend_score,
           pc.id AS cluster_id,
           COALESCE(ps.cluster_bonus, 1.0) AS cluster_bonus,
           p.scraped_at
    FROM posts p
    LEFT JOIN post_scores ps ON ps.post_id = p.id
    LEFT JOIN post_cluster_members pcm ON pcm.post_id = p.id
    LEFT JOIN post_clusters pc
      ON pc.id = pcm.cluster_id
     AND pc.cluster_created_at > NOW() - make_interval(hours => $1)
    WHERE p.scraped_at > NOW() - make_interval(hours => $1)
      AND COALESCE(p.category, '') IN ${SCORED_CATEGORIES_SQL}
    ORDER BY COALESCE(ps.trend_score, 0) DESC
    LIMIT 500
  `, [windowHours]);

  return rows.map(r => ({
    id: r.id,
    sourceKey: r.source_key,
    category: r.category,
    title: r.title,
    contentSnippet: r.content_snippet,
    thumbnail: r.thumbnail,
    trendScore: r.trend_score,
    clusterId: r.cluster_id,
    clusterBonus: r.cluster_bonus,
    scrapedAt: new Date(r.scraped_at),
  }));
}

// ─── Step 2: Build Cluster Groups ───

interface ClusterGroup {
  clusterId: number | null;
  posts: ScoredPost[];
}

function buildClusterGroups(posts: readonly ScoredPost[]): ClusterGroup[] {
  const clusterMap = new Map<number, ScoredPost[]>();
  const standalone: ScoredPost[] = [];

  for (const post of posts) {
    if (post.clusterId !== null) {
      const arr = clusterMap.get(post.clusterId) ?? [];
      arr.push(post);
      clusterMap.set(post.clusterId, arr);
    } else {
      standalone.push(post);
    }
  }

  const groups: ClusterGroup[] = [];
  for (const [clusterId, clusterPosts] of clusterMap) {
    groups.push({ clusterId, posts: clusterPosts });
  }

  // High-score standalone news/news-video posts become their own groups
  for (const post of standalone) {
    const ch = getChannel(post.category);
    const isNewsVideo = ch === 'video' && NEWS_VIDEO_SOURCES.has(post.sourceKey);
    if ((ch === 'news' || isNewsVideo) && post.trendScore > 0) {
      groups.push({ clusterId: null, posts: [post] });
    }
  }

  return groups;
}

// ─── Step 3: Merge Via Trend Keywords ───

/**
 * keyword_idf 테이블에서 IDF + DF 캐시를 로드한다.
 * Phase 1 keywordIdfBatch가 5분 주기로 채움. 24h 이내 stale 제외.
 * df는 "키워드가 실제로 코퍼스에 등장한 횟수" — wiki phantom 키워드(df=0) 필터에 사용.
 */
export interface IdfStat { readonly df: number; readonly idf: number; }

async function loadIdfMap(pool: Pool): Promise<Map<string, IdfStat>> {
  const map = new Map<string, IdfStat>();
  try {
    const { rows } = await pool.query<{ keyword_normalized: string; df: number; idf: number }>(
      `SELECT keyword_normalized, df, idf FROM keyword_idf
       WHERE computed_at > NOW() - INTERVAL '24 hours'`,
    );
    for (const r of rows) map.set(r.keyword_normalized, { df: Number(r.df), idf: Number(r.idf) });
  } catch (err) {
    logger.warn({ err }, '[issueAggregator] keyword_idf load failed — using fallback');
  }
  return map;
}

function idfOf(map: ReadonlyMap<string, IdfStat>, kw: string): number {
  const v = map.get(kw);
  return v == null ? IDF_FALLBACK : v.idf;
}

/** 코퍼스 등장 여부 — wiki phantom(df=0) 키워드 필터.
 *  IDF 캐시에 없으면 콜드스타트로 간주하여 통과 (Phase 1 안전망). */
function appearsInCorpus(map: ReadonlyMap<string, IdfStat>, kw: string): boolean {
  const v = map.get(kw);
  if (v == null) return true; // 콜드스타트 — 차단하지 않음
  return v.df >= 2;            // 최소 2개 문서에 등장해야 의미 있는 신호
}

/**
 * Phase 2/3 병합 판정 — 순수 함수로 추출(단위 테스트 + __internal__ 노출).
 *   1) ACTION_ONLY_STOPWORDS 제거
 *   2) wiki phantom(df<2 in corpus) 제거 — 위키 문서 제목이 트렌드 키워드로 들어와도 매칭 신호로 안 침
 *   3) IDF 합 < idfThreshold → 거부
 *   4) 양쪽 임베딩 가용 시 cos < cosThreshold → 거부 (한쪽 부재면 IDF만으로 결정)
 */
export type MergeDecisionReason =
  | 'merge'
  | 'no_informative_kw'
  | 'low_idf'
  | 'low_cos'
  | 'entity_mismatch'
  | 'entity_borderline';

export function decideMergeByIdfAndCos(opts: {
  sharedKeywords: readonly string[];
  idfMap: ReadonlyMap<string, IdfStat>;
  idfThreshold: number;
  cosThreshold: number;
  cos: number | null;
  stopwords: ReadonlySet<string>;
  entitiesA?: ReadonlySet<string>;
  entitiesB?: ReadonlySet<string>;
}): { merge: boolean; reason: MergeDecisionReason; idfSum: number } {
  const informative = opts.sharedKeywords.filter(kw => {
    if (opts.stopwords.has(kw)) return false;
    if (!appearsInCorpus(opts.idfMap, kw)) return false;
    return true;
  });
  if (informative.length === 0) {
    return { merge: false, reason: 'no_informative_kw', idfSum: 0 };
  }
  const idfSum = informative.reduce((s, kw) => s + idfOf(opts.idfMap, kw), 0);
  if (idfSum < opts.idfThreshold) {
    return { merge: false, reason: 'low_idf', idfSum };
  }
  if (opts.cos != null && opts.cos < opts.cosThreshold) {
    return { merge: false, reason: 'low_cos', idfSum };
  }
  // Phase 4 — Entity hard gate
  const ea = opts.entitiesA;
  const eb = opts.entitiesB;
  if (ea && eb) {
    const aHas = ea.size > 0;
    const bHas = eb.size > 0;
    if (aHas && bHas) {
      // 양쪽 모두 entity 있음 → 교집합 1개 이상 필수
      if (entityIntersection(ea, eb) === 0) {
        return { merge: false, reason: 'entity_mismatch', idfSum };
      }
    } else if (!aHas && !bHas) {
      // 양쪽 모두 entity 없음 + cos가 borderline → arbiter 위임 신호
      if (opts.cos != null && opts.cos >= ARBITER_COS_LOW && opts.cos <= ARBITER_COS_HIGH) {
        return { merge: false, reason: 'entity_borderline', idfSum };
      }
    }
    // 한쪽만 entity 있음: hard-block 안 함 (인용/추상 제목과 구체 사건의 매칭 가능성)
  }
  return { merge: true, reason: 'merge', idfSum };
}

async function mergeViaTrendKeywords(
  pool: Pool,
  groups: ClusterGroup[],
  cfg: IssueConfig,
): Promise<IssueGroup[]> {
  const keywordIndex = await buildKeywordIndex(pool);
  const idfMap = await loadIdfMap(pool);
  // 비동기 arbiter 결정 캐시: 직전 48h 내 mergeArbiterWorker가 기록한 결정을 로드.
  // critical path에서 Gemini를 호출하지 않기 위해 여기서 맵만 미리 받아둔다.
  const arbiterDecisions = await loadRecentDecisions(pool, 48);

  type GroupWithKeywords = { group: ClusterGroup; keywords: Set<string> };
  const groupsWithKw: GroupWithKeywords[] = groups.map(g => {
    const keywords = new Set<string>();
    for (const post of g.posts) {
      // Title-only: 본문 부수 언급으로 인한 잘못된 병합 방지
      const match = matchPostToKeywords(post.title, keywordIndex);
      for (const src of match.matchedSources) {
        keywords.add(src);
      }
      // Collect kw: tags from matched keywords (single pass via matchedKeywords)
      if (match.matchedKeywords) {
        for (const kw of match.matchedKeywords) {
          keywords.add(`kw:${kw}`);
        }
      }
    }
    return { group: g, keywords };
  });

  // Union-Find with group size limit to prevent chain merging
  const MAX_POSTS_PER_ISSUE = 50;
  const parent = Array.from({ length: groupsWithKw.length }, (_, i) => i);
  const groupSize = groupsWithKw.map(g => g.group.posts.length);

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a: number, b: number): boolean {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    // Refuse merge if combined size would exceed limit
    if (groupSize[ra] + groupSize[rb] > MAX_POSTS_PER_ISSUE) return false;
    parent[ra] = rb;
    groupSize[rb] += groupSize[ra];
    return true;
  }

  const MIN_MERGE_KW_LEN = 3; // 2글자 키워드("이란","미국" 등) 병합 제외

  // 순수 동작어/접속어 — 주체 정보가 없어 단독으로 이슈를 특정할 수 없는 키워드
  // 이 키워드만 공유하는 쌍은 병합하지 않음 (다른 키워드와 함께일 때는 참여)
  const ACTION_ONLY_STOPWORDS = new Set([
    '관련', '대한', '통해', '위해', '대해', '가능', '예정', '필요',
    '발표', '논의', '결정', '보도', '전망', '우려', '지적', '요구',
    '비판', '입장', '계획', '방안', '대책', '사건', '사고', '주장',
    '의혹', '혐의', '논란', '합의',
  ]);

  const kwToGroups = new Map<string, number[]>();
  for (let i = 0; i < groupsWithKw.length; i++) {
    for (const kw of groupsWithKw[i].keywords) {
      if (!kw.startsWith('kw:')) continue;
      const rawKw = kw.slice(3);
      if (rawKw.length < MIN_MERGE_KW_LEN) continue;
      const arr = kwToGroups.get(kw) ?? [];
      arr.push(i);
      kwToGroups.set(kw, arr);
    }
  }

  // 공유 키워드 후보 수집
  const pairSharedKws = new Map<string, Set<string>>();
  for (const [kw, indices] of kwToGroups) {
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const pairKey = indices[a] < indices[b]
          ? `${indices[a]}:${indices[b]}` : `${indices[b]}:${indices[a]}`;
        const existing = pairSharedKws.get(pairKey);
        if (existing) {
          existing.add(kw.slice(3));
        } else {
          pairSharedKws.set(pairKey, new Set([kw.slice(3)]));
        }
      }
    }
  }

  // 그룹별 대표 포스트 ID + 제목 (임베딩 게이트 + entity 게이트용)
  function repPost(idx: number): { id: number; title: string } | null {
    const g = groupsWithKw[idx].group;
    if (g.posts.length === 0) return null;
    const sorted = [...g.posts].sort((a, b) => b.trendScore - a.trendScore);
    const top = sorted[0];
    return top ? { id: top.id, title: top.title } : null;
  }
  // entity Set은 그룹의 모든 포스트 제목을 합쳐 추출 (단일 대표보다 robust)
  const groupEntities: Set<string>[] = groupsWithKw.map(({ group }) => {
    const e = new Set<string>();
    for (const p of group.posts) {
      for (const t of extractEntities(p.title)) e.add(t);
    }
    return e;
  });

  // Phase 2/3 병합 판정:
  //   1) 공유 키워드에서 ACTION_ONLY_STOPWORDS 제거
  //   2) 남은 키워드들의 IDF 합 ≥ MERGE_IDF_THRESHOLD
  //   3) 양쪽 임베딩 가용 시 cosine ≥ MERGE_COS_THRESHOLD (한쪽 부재 시 IDF만으로 결정)
  let mergedByIdf = 0;
  let rejectedByIdf = 0;
  let rejectedByCos = 0;
  let rejectedByEntity = 0;
  let arbiterHitMerged = 0;    // 이전 worker 결정으로 즉시 union
  let arbiterHitRejected = 0;  // 이전 worker 결정이 false
  let arbiterEnqueued = 0;     // 이번 tick에 pending 큐에 새로 기록
  const pendingToRecord: PendingPairInput[] = [];

  for (const [pairKey, sharedKws] of pairSharedKws) {
    const [aStr, bStr] = pairKey.split(':');
    const a = Number(aStr);
    const b = Number(bStr);
    if (find(a) === find(b)) continue;

    const repA = repPost(a);
    const repB = repPost(b);
    const cos = (repA && repB) ? embeddingCosine(repA.id, repB.id) : null;

    const decision = decideMergeByIdfAndCos({
      sharedKeywords: [...sharedKws],
      idfMap,
      idfThreshold: cfg.mergeIdfThreshold,
      cosThreshold: cfg.mergeCosThreshold,
      cos,
      stopwords: ACTION_ONLY_STOPWORDS,
      entitiesA: groupEntities[a],
      entitiesB: groupEntities[b],
    });

    if (decision.reason === 'entity_borderline' && repA && repB) {
      // 비동기 arbiter: critical path에서 Gemini를 호출하지 않고
      // (1) 이전 worker 결정이 있으면 즉시 적용
      // (2) 없으면 pending 큐에 기록만 하고 이번 tick에서는 분리 유지.
      const hash = computePairHash(repA.title, repB.title);
      const prior = arbiterDecisions.get(hash);
      if (prior === true) {
        if (union(a, b)) { mergedByIdf++; arbiterHitMerged++; }
      } else if (prior === false) {
        arbiterHitRejected++;
      } else {
        pendingToRecord.push({
          titleA: repA.title,
          titleB: repB.title,
          postAId: repA.id,
          postBId: repB.id,
          cos,
        });
        arbiterEnqueued++;
      }
      continue;
    }

    if (!decision.merge) {
      if (decision.reason === 'low_idf') rejectedByIdf++;
      else if (decision.reason === 'low_cos') rejectedByCos++;
      else if (decision.reason === 'entity_mismatch') rejectedByEntity++;
      continue;
    }

    if (union(a, b)) mergedByIdf++;
  }

  // 비동기 기록: 실패해도 critical path 진행에 영향 없음.
  if (pendingToRecord.length > 0) {
    recordPendingMergeDecisions(pool, pendingToRecord).catch(err => {
      logger.warn({ err }, '[issueAggregator] pending merge record failed (non-fatal)');
    });
  }

  if (mergedByIdf > 0 || rejectedByIdf > 0 || rejectedByCos > 0 || rejectedByEntity > 0 || arbiterEnqueued > 0) {
    logger.info(
      {
        mergedByIdf, rejectedByIdf, rejectedByCos, rejectedByEntity,
        arbiterHitMerged, arbiterHitRejected, arbiterEnqueued,
        priorDecisions: arbiterDecisions.size,
        candidatePairs: pairSharedKws.size,
      },
      '[issueAggregator] Step 3 IDF+cos+entity merge decisions (async arbiter)',
    );
  }

  // Collect merged groups — split posts into news/community/video
  const merged = new Map<number, { groups: ClusterGroup[]; keywords: Set<string> }>();
  for (let i = 0; i < groupsWithKw.length; i++) {
    const root = find(i);
    const entry = merged.get(root) ?? { groups: [], keywords: new Set() };
    entry.groups.push(groupsWithKw[i].group);
    for (const kw of groupsWithKw[i].keywords) {
      entry.keywords.add(kw);
    }
    merged.set(root, entry);
  }

  const issueGroups: IssueGroup[] = [];
  for (const { groups: mergedGroupList, keywords } of merged.values()) {
    const clusterIds = new Set<number>();
    const standalonePostIds = new Set<number>();
    const newsPosts: ScoredPost[] = [];
    const communityPosts: ScoredPost[] = [];
    const videoPosts: ScoredPost[] = [];

    for (const g of mergedGroupList) {
      if (g.clusterId !== null) clusterIds.add(g.clusterId);
      for (const post of g.posts) {
        const ch = getChannel(post.category);
        if (ch === 'news') {
          newsPosts.push(post);
        } else if (ch === 'video') {
          videoPosts.push(post);
        } else {
          communityPosts.push(post);
        }
        if (g.clusterId === null) standalonePostIds.add(post.id);
      }
    }

    const matchedKeywords = [...keywords]
      .filter(k => k.startsWith('kw:'))
      .map(k => k.slice(3));

    const representativeTitle = newsPosts[0]?.title ?? videoPosts[0]?.title ?? communityPosts[0]?.title ?? '';
    const match = matchPostToKeywords(representativeTitle, keywordIndex);
    const trendSignalScore = computeTrendSignalBonus(match) - 1.0;

    issueGroups.push({
      clusterIds,
      standalonePostIds,
      newsPosts,
      communityPosts,
      videoPosts,
      matchedKeywords,
      trendSignalScore: Math.max(0, trendSignalScore),
    });
  }

  return issueGroups;
}

// ─── Step 3.5: 이슈 중복제거 (v4 — 임베딩 단일 진실 소스) ───

// v4 설계 근거:
//  - v3까지 bigram Jaccard / IDF 가중 word sim / containment / Gemini borderline 4~5단 혼합.
//  - 각 단계의 임계값/가중치가 서로 간섭해 튜닝이 누적 부채가 됨. Step 3.6은 요약 예산까지 공유.
//  - 본 버전은 임베딩 코사인 단일 판정 + 얇은 guard 3종(뉴스 앵커 / 키워드 자카드 / 크기 상한).
//  - 임베딩 부재(신규 포스트 embedding 생성 실패 등)로 유사도가 null인 쌍은 병합 보류.

const EMBED_MERGE_THRESHOLD = 0.82;      // 기본 병합 임계값
const EMBED_STRICT_THRESHOLD = 0.88;     // 키워드 교집합 부족 시 상향 임계값
const KEYWORD_JACCARD_MIN = 0.3;         // guard B: 키워드 자카드 최소선
const MAX_POSTS_PER_DEDUP_GROUP = 80;    // guard C: 병합 후 그룹 최대 포스트 수

function keywordJaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const k of sa) if (sb.has(k)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export const __internal__ = {
  deduplicateIssuesByEmbedding: (groups: readonly IssueGroup[]) => deduplicateIssuesByEmbedding(groups),
  keywordJaccard,
  decideMergeByIdfAndCos,
  EMBED_MERGE_THRESHOLD,
  EMBED_STRICT_THRESHOLD,
  KEYWORD_JACCARD_MIN,
  MAX_POSTS_PER_DEDUP_GROUP,
  DEFAULT_MERGE_IDF_THRESHOLD,
  DEFAULT_MERGE_COS_THRESHOLD,
  IDF_FALLBACK,
};

function deduplicateIssuesByEmbedding(groups: readonly IssueGroup[]): IssueGroup[] {
  if (groups.length <= 1) return [...groups];

  // 대표 포스트: 최고 점수 뉴스 > 뉴스채널 영상 > 일반 영상 > 커뮤니티
  const repPosts = groups.map(g =>
    [...g.newsPosts].sort((a, b) => b.trendScore - a.trendScore)[0] ??
    [...g.videoPosts].sort((a, b) => b.trendScore - a.trendScore)[0] ??
    g.communityPosts[0] ?? null,
  );

  // 그룹별 entity Set (모든 멤버 제목 합집합)
  const groupEntities: Set<string>[] = groups.map(g => {
    const e = new Set<string>();
    for (const p of g.newsPosts) for (const t of extractEntities(p.title)) e.add(t);
    for (const p of g.videoPosts) for (const t of extractEntities(p.title)) e.add(t);
    for (const p of g.communityPosts) for (const t of extractEntities(p.title)) e.add(t);
    return e;
  });

  const parent = Array.from({ length: groups.length }, (_, i) => i);
  const groupPostCount = groups.map(g =>
    g.newsPosts.length + g.communityPosts.length + g.videoPosts.length,
  );

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  /** guard C 포함 union: 병합 후 크기가 MAX 초과면 거부 */
  function union(a: number, b: number): boolean {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    if (groupPostCount[ra] + groupPostCount[rb] > MAX_POSTS_PER_DEDUP_GROUP) return false;
    parent[ra] = rb;
    groupPostCount[rb] += groupPostCount[ra];
    return true;
  }

  let mergedPairs = 0;
  let skippedNoAnchor = 0;
  let skippedKeywordGuard = 0;
  let skippedEntity = 0;

  for (let i = 0; i < groups.length; i++) {
    const repA = repPosts[i];
    if (!repA) continue;
    for (let j = i + 1; j < groups.length; j++) {
      if (find(i) === find(j)) continue;
      const repB = repPosts[j];
      if (!repB) continue;

      // guard A: 양쪽 모두 뉴스 앵커가 있어야 병합 (단일 커뮤니티/영상 그룹끼리 병합 방지)
      if (groups[i].newsPosts.length === 0 && groups[j].newsPosts.length === 0) {
        skippedNoAnchor++;
        continue;
      }

      const cos = embeddingCosine(repA.id, repB.id);
      if (cos == null || cos < EMBED_MERGE_THRESHOLD) continue;

      // guard B: 키워드 자카드 < 0.3 이면 strict 임계값 요구 (서로 다른 주제 과잉 병합 방지)
      const kwSim = keywordJaccard(groups[i].matchedKeywords, groups[j].matchedKeywords);
      if (kwSim < KEYWORD_JACCARD_MIN && cos < EMBED_STRICT_THRESHOLD) {
        skippedKeywordGuard++;
        continue;
      }

      // guard D (Phase 4): entity hard-gate — 양쪽 모두 entity 있는데 교집합 0이면 거부
      const ea = groupEntities[i];
      const eb = groupEntities[j];
      if (ea.size > 0 && eb.size > 0 && entityIntersection(ea, eb) === 0) {
        skippedEntity++;
        continue;
      }

      if (union(i, j)) mergedPairs++;
    }
  }

  if (mergedPairs > 0 || skippedNoAnchor > 0 || skippedKeywordGuard > 0 || skippedEntity > 0) {
    logger.info(
      { mergedPairs, skippedNoAnchor, skippedKeywordGuard, skippedEntity, inputGroups: groups.length },
      '[dedup] embedding-based merge',
    );
  }

  const merged = new Map<number, IssueGroup>();
  for (let i = 0; i < groups.length; i++) {
    const root = find(i);
    const existing = merged.get(root);
    if (!existing) {
      merged.set(root, groups[i]);
    } else {
      merged.set(root, {
        clusterIds: new Set([...existing.clusterIds, ...groups[i].clusterIds]),
        standalonePostIds: new Set([...existing.standalonePostIds, ...groups[i].standalonePostIds]),
        newsPosts: [...existing.newsPosts, ...groups[i].newsPosts],
        communityPosts: [...existing.communityPosts, ...groups[i].communityPosts],
        videoPosts: [...existing.videoPosts, ...groups[i].videoPosts],
        matchedKeywords: [...new Set([...existing.matchedKeywords, ...groups[i].matchedKeywords])],
        trendSignalScore: Math.max(existing.trendSignalScore, groups[i].trendSignalScore),
      });
    }
  }

  return [...merged.values()];
}

// ─── Step 4: Score and Filter (Fix 1~6 적용) ───

const LN2 = Math.LN2;
const BREAKING_KEYWORDS = ['속보', '[속보]', '긴급', '[긴급]'];

/** Fix 1: 로그 체감 수익 — 상위 포스트 우선, 추가 포스트는 체감 기여
 *  NaN/Infinity 포스트는 자동으로 제외 (production NaN 누출 방지). */
function aggregatePostScores(scores: readonly number[], k: number): number {
  const valid = scores.filter(Number.isFinite);
  if (valid.length === 0) return 0;
  const sorted = valid.sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    total += sorted[i] / (1 + k * Math.log1p(i));
  }
  return Number.isFinite(total) ? total : 0;
}

/** Fix 3: 이슈 모멘텀 — 최근 포스트 유입 가속도 */
function issueMomentum(group: IssueGroup, cfg: IssueConfig): number {
  const allPosts = [...group.newsPosts, ...group.communityPosts, ...group.videoPosts];
  if (allPosts.length < 2) return 1.0;

  const now = Date.now();
  const oneHourAgo = now - 3_600_000;
  const threeHoursAgo = now - 10_800_000;

  const recentCount = allPosts.filter(p => p.scrapedAt.getTime() > oneHourAgo).length;
  const olderCount = allPosts.filter(p => {
    const t = p.scrapedAt.getTime();
    return t > threeHoursAgo && t <= oneHourAgo;
  }).length;

  const acceleration = olderCount > 0
    ? (recentCount / 1) / (olderCount / 2)
    : recentCount > 0 ? 2.0 : 0.5;

  return Math.max(cfg.momentumPenaltyMin, Math.min(1.0 + cfg.momentumWeight * Math.log(acceleration), 1.8));
}

/** Fix 5: 이슈 레벨 교차소스 + 다양성 보너스 */
function sourceDiversityBonus(group: IssueGroup, cfg: IssueConfig): number {
  const newsOutlets = new Set(group.newsPosts.map(p => p.sourceKey));
  const communityOutlets = new Set(group.communityPosts.map(p => p.sourceKey));
  const videoOutlets = new Set(group.videoPosts.map(p => p.sourceKey));

  const totalDistinct = newsOutlets.size + communityOutlets.size + videoOutlets.size;
  const channelCount = [newsOutlets.size, communityOutlets.size, videoOutlets.size]
    .filter(n => n > 0).length;

  const sourceDiv = 1.0 + 0.3 * Math.log2(Math.max(totalDistinct, 1));
  const channelDiv = channelCount === 3 ? 1.0 + cfg.crossSource3
    : channelCount === 2 ? 1.0 + cfg.crossSource2
    : 1.0;

  return Math.min(sourceDiv * channelDiv, cfg.diversityCap);
}

/** Fix 6: "속보" 키워드 이슈 레벨 부스트 */
function breakingKeywordBoost(group: IssueGroup, cfg: IssueConfig): number {
  const allPosts = [...group.newsPosts, ...group.communityPosts, ...group.videoPosts];

  const breakingPosts = allPosts.filter(p =>
    BREAKING_KEYWORDS.some(kw => p.title.includes(kw)),
  );
  if (breakingPosts.length === 0) return 1.0;

  const now = Date.now();
  const newestBreakingAge = Math.min(
    ...breakingPosts.map(p => (now - p.scrapedAt.getTime()) / 60_000),
  );

  return 1.0 + (cfg.breakingKwMaxBoost - 1.0) * Math.exp(-LN2 * newestBreakingAge / cfg.breakingKwHalflife);
}

function scoreAndFilter(groups: readonly IssueGroup[], cfg: IssueConfig): ScoredIssue[] {
  // Filter: must have ≥1 news post OR ≥1 news-channel video post
  const anchored = groups.filter(g =>
    g.newsPosts.length > 0 ||
    g.videoPosts.some(p => NEWS_VIDEO_SOURCES.has(p.sourceKey)),
  );

  // Fix 4: 커뮤니티 동적 가중치를 위한 중앙값 계산
  const communityScores = anchored.map(g =>
    aggregatePostScores(
      g.communityPosts.map(p => p.trendScore / Math.max(p.clusterBonus, 0.01)),
      cfg.diminishingK,
    ),
  );
  const sortedCS = [...communityScores].sort((a, b) => a - b);
  const medianCommunityAgg = sortedCS.length > 0
    ? sortedCS[Math.floor(sortedCS.length / 2)]
    : 1.0;

  const scored = anchored.map((g, i) => {
    // Fix 2: clusterBonus 제거한 기본 점수 사용
    const newsAgg = aggregatePostScores(
      g.newsPosts.map(p => p.trendScore / Math.max(p.clusterBonus, 0.01)),
      cfg.diminishingK,
    );
    const communityAgg = communityScores[i];
    const videoAgg = aggregatePostScores(
      g.videoPosts.map(p => {
        const w = NEWS_VIDEO_SOURCES.has(p.sourceKey) ? cfg.videoNewsWeight : cfg.videoGeneralWeight;
        return (p.trendScore / Math.max(p.clusterBonus, 0.01)) * w;
      }),
      cfg.diminishingK,
    );

    // Fix 4: 동적 커뮤니티 가중치
    const communityIntensity = medianCommunityAgg > 0
      ? communityAgg / medianCommunityAgg
      : 0;
    const effectiveCW = cfg.communityWeight + cfg.communityBoost * Math.min(communityIntensity / 3.0, 1.0);

    const rawScore =
      newsAgg * cfg.newsWeight +
      communityAgg * effectiveCW +
      videoAgg +
      g.trendSignalScore * cfg.trendSignalWeight;

    // Fix 3 + Fix 5 + Fix 6: 곱셈 보너스
    const momentum = issueMomentum(g, cfg);
    const diversity = sourceDiversityBonus(g, cfg);
    const breaking = breakingKeywordBoost(g, cfg);

    // v3: breaking과 momentum×diversity를 곱하지 않고 max로 선택.
    // 이유: 속보성(순간)과 누적 확산(축적)은 서로 다른 가치 축이고,
    // 둘 다 강한 이슈가 곱셈으로 top에 과도하게 고착되는 현상을 방지.
    const rawIssueScore = rawScore * Math.max(momentum * diversity, breaking);
    const issueScore = Number.isFinite(rawIssueScore) ? rawIssueScore : 0;
    return { group: g, issueScore, momentumScore: Number.isFinite(momentum) ? momentum : 1.0 };
  });

  scored.sort((a, b) => b.issueScore - a.issueScore);
  return scored;
}

// ─── Thumbnail Selection ───

const LOW_QUALITY_PATTERNS = /no_image|noimage|placeholder|favicon|logo|icon_default|thumb_default|default_thumb|blank\.|empty_img|generic_thumb|missing_img|spacer\.|pixel\./i;
const TINY_IMAGE_PATTERNS = /[?&](?:w|width|size|sz)=(?:[1-9]|[1-4]\d)(?:&|$)/i;

function isValidThumbnail(url: string): boolean {
  return !LOW_QUALITY_PATTERNS.test(url) && !TINY_IMAGE_PATTERNS.test(url);
}

function pickBestThumbnail(posts: readonly ScoredPost[]): string | null {
  const candidates = posts.filter(p => p.thumbnail && isValidThumbnail(p.thumbnail));
  if (candidates.length === 0) return null;

  const scored = candidates.map(p => {
    let score = 0;
    const ch = getChannel(p.category);
    if (ch === 'video') score += 4;  // YouTube thumbnails are always valid
    else if (ch === 'news') score += 3;
    else score += 1;
    score += Math.min(p.trendScore, 5);
    return { thumbnail: p.thumbnail!, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].thumbnail;
}

// ─── Step 5: Build Issue Row ───

function buildIssueRow(scoredIssue: ScoredIssue, cfg: IssueConfig): IssueRow {
  const { group, issueScore, momentumScore } = scoredIssue;
  const sortedNews = [...group.newsPosts].sort((a, b) => b.trendScore - a.trendScore);
  const sortedVideo = [...group.videoPosts].sort((a, b) => b.trendScore - a.trendScore);
  const canonicalPost = sortedNews[0] ?? sortedVideo[0];

  // 채널별 집계 (분해 점수용 — DB 기록)
  const newsScore = aggregatePostScores(
    group.newsPosts.map(p => p.trendScore / Math.max(p.clusterBonus, 0.01)), cfg.diminishingK,
  );
  const communityScore = aggregatePostScores(
    group.communityPosts.map(p => p.trendScore / Math.max(p.clusterBonus, 0.01)), cfg.diminishingK,
  );
  const videoScore = aggregatePostScores(
    group.videoPosts.map(p => {
      const w = NEWS_VIDEO_SOURCES.has(p.sourceKey) ? cfg.videoNewsWeight : cfg.videoGeneralWeight;
      return (p.trendScore / Math.max(p.clusterBonus, 0.01)) * w;
    }), cfg.diminishingK,
  );

  const categoryLabel = deriveCategoryLabel(canonicalPost?.title ?? '');

  // Find best thumbnail — score all posts, prefer news sources (higher resolution)
  const thumbnail = pickBestThumbnail([...group.newsPosts, ...group.videoPosts, ...group.communityPosts]);

  const clusterIds = [...group.clusterIds];
  const standalonePostIds = [...group.standalonePostIds];

  return {
    title: canonicalPost?.title ?? '알 수 없는 이슈',
    summary: null,
    categoryLabel,
    issueScore,  // scoreAndFilter에서 계산된 최종 점수 (momentum×diversity×breaking 포함)
    newsScore,
    communityScore,
    videoScore,
    trendSignalScore: group.trendSignalScore,
    momentumScore,
    newsPostCount: group.newsPosts.length,
    communityPostCount: group.communityPosts.length,
    videoPostCount: group.videoPosts.length,
    representativeThumbnail: thumbnail,
    clusterIds,
    standalonePostIds,
    matchedTrendKeywords: group.matchedKeywords,
    stableId: computeStableId(clusterIds, standalonePostIds),
  };
}

// ─── Title-based Category Inference ───

const CATEGORY_KEYWORDS: readonly [RegExp, string][] = [
  [/정치|국회|대통령|여당|야당|총리|선거|탄핵|국정|개헌/, '정치'],
  [/경제|증시|코스피|금리|환율|부동산|주가|투자|물가|GDP/, '경제'],
  [/연예|아이돌|드라마|배우|가수|예능|방송|K팝|컴백/, '연예'],
  [/스포츠|야구|축구|농구|올림픽|KBO|K리그|EPL|NBA/, '스포츠'],
  [/IT|AI|인공지능|반도체|테크|과학|우주|로봇|SW|앱/, 'IT과학'],
  [/세계|미국|중국|일본|러시아|우크라|트럼프|바이든|유럽|NATO/, '세계'],
  [/생활|날씨|건강|교통|맛집|여행|육아|교육|의료/, '생활'],
];

function deriveCategoryLabel(title: string): string {
  for (const [pattern, label] of CATEGORY_KEYWORDS) {
    if (pattern.test(title)) return label;
  }
  return '사회';
}

// ─── Step 7: Calculate Rank Changes ───

// ─── Step 7: Write to DB ───

async function writeIssueRankings(pool: Pool, issues: readonly IssueRow[], windowHours: IssueWindow = 12): Promise<number> {
  if (issues.length === 0) return 0;

  // Quiet hours: extend expires_at if next batch would be in quiet hours
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const baseTtlMs = WINDOW_TTL_MS[windowHours];
  let quietTtlMs = baseTtlMs;
  if (kstHour >= 1 && kstHour < 6) {
    // Extend to cover quiet hours until 07:00 KST
    const now = new Date();
    const expiresKST = new Date(now);
    expiresKST.setUTCHours(22, 0, 0, 0); // 07:00 KST = 22:00 UTC
    if (expiresKST <= now) expiresKST.setUTCDate(expiresKST.getUTCDate() + 1);
    quietTtlMs = expiresKST.getTime() - now.getTime();
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Carry forward: 기존 요약 + 순위 + AI 필드를 보존 (rank_change 사전계산용)
    // rank_change는 같은 윈도우 내에서만 비교, 요약은 모든 윈도우에서 검색
    const { rows: existingRows } = await client.query<{
      stable_id: string; title: string; summary: string; category_label: string;
      quality_score: number | null; ai_keywords: string[]; sentiment: string | null;
      rank_position: number; cluster_ids: number[]; standalone_post_ids: number[];
      window_hours: number;
    }>(
      `SELECT stable_id, title, summary, category_label,
              quality_score, ai_keywords, sentiment,
              ROW_NUMBER() OVER (PARTITION BY window_hours ORDER BY issue_score DESC)::int AS rank_position,
              cluster_ids, standalone_post_ids, window_hours
       FROM issue_rankings
       WHERE expires_at > NOW()`,
    );
    // 요약은 모든 윈도우에서 가져옴 (cross-window carry-forward)
    const summaryMap = new Map(
      existingRows.filter(r => r.summary != null && r.stable_id != null && !r.summary.startsWith('[fallback]') && !r.summary.startsWith('관련 기사')).map(r => [r.stable_id, {
        title: r.title, summary: r.summary, categoryLabel: r.category_label,
        qualityScore: r.quality_score, aiKeywords: r.ai_keywords ?? [], sentiment: r.sentiment,
      }]),
    );

    // rank_change는 같은 윈도우 내에서만 비교
    const sameWindowRows = existingRows.filter(r => r.window_hours === windowHours);
    const computeRankChange = (stableId: string, currentRank: number, clusterIds: readonly number[], standaloneIds: readonly number[]): number | null => {
      if (sameWindowRows.length === 0) return null;
      const byStableId = sameWindowRows.find(r => r.stable_id && r.stable_id === stableId);
      if (byStableId) return byStableId.rank_position - currentRank;
      const currIds = [...clusterIds, ...standaloneIds];
      for (const prev of sameWindowRows) {
        const prevIds = new Set([...prev.cluster_ids, ...prev.standalone_post_ids]);
        if (prevIds.size === 0 && currIds.length === 0) continue;
        const overlap = currIds.filter(id => prevIds.has(id)).length;
        const maxSize = Math.max(prevIds.size, currIds.length);
        if (maxSize > 0 && overlap / maxSize >= 0.5) {
          return prev.rank_position - currentRank;
        }
      }
      return null;
    };

    // 점진적 업데이트: 해당 윈도우에서 새 배치에 없는 기존 이슈만 삭제
    const newStableIds = issues.map(i => i.stableId);
    await client.query(
      `DELETE FROM issue_rankings
       WHERE window_hours = $2
         AND (stable_id IS NULL OR NOT (stable_id = ANY($1::text[])))`,
      [newStableIds, windowHours],
    );

    let inserted = 0;
    let rankIdx = 0;
    for (const issue of issues) {
      rankIdx++;
      const isStale = issue.momentumScore <= 0.7;
      const ttlMs = kstHour >= 1 && kstHour < 6
        ? quietTtlMs
        : isStale ? 2 * 60 * 60 * 1000 : baseTtlMs;

      const rankChange = computeRankChange(issue.stableId, rankIdx, issue.clusterIds, issue.standalonePostIds);

      // 기존 행이 있으면 스코어 + 메타데이터 업데이트, 없으면 INSERT
      const upsertResult = await client.query(
        `INSERT INTO issue_rankings
          (title, summary, category_label, issue_score, news_score, community_score,
           trend_signal_score, video_score, momentum_score, news_post_count, community_post_count,
           video_post_count, representative_thumbnail, cluster_ids, standalone_post_ids,
           matched_trend_keywords, rank_change, stable_id, window_hours, calculated_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$20,NOW(),NOW()+$19::interval)
         ON CONFLICT (stable_id, window_hours) WHERE stable_id IS NOT NULL DO UPDATE SET
           issue_score = EXCLUDED.issue_score,
           news_score = EXCLUDED.news_score,
           community_score = EXCLUDED.community_score,
           trend_signal_score = EXCLUDED.trend_signal_score,
           video_score = EXCLUDED.video_score,
           momentum_score = EXCLUDED.momentum_score,
           news_post_count = EXCLUDED.news_post_count,
           community_post_count = EXCLUDED.community_post_count,
           video_post_count = EXCLUDED.video_post_count,
           representative_thumbnail = EXCLUDED.representative_thumbnail,
           cluster_ids = EXCLUDED.cluster_ids,
           standalone_post_ids = EXCLUDED.standalone_post_ids,
           matched_trend_keywords = EXCLUDED.matched_trend_keywords,
           rank_change = EXCLUDED.rank_change,
           calculated_at = NOW(),
           expires_at = NOW() + (EXCLUDED.expires_at - EXCLUDED.calculated_at)`,
        [
          issue.title, issue.summary, issue.categoryLabel,
          issue.issueScore, issue.newsScore, issue.communityScore,
          issue.trendSignalScore, issue.videoScore, issue.momentumScore,
          issue.newsPostCount, issue.communityPostCount, issue.videoPostCount,
          issue.representativeThumbnail, issue.clusterIds, issue.standalonePostIds,
          issue.matchedTrendKeywords, rankChange, issue.stableId,
          `${ttlMs} milliseconds`, windowHours,
        ],
      );
      inserted += upsertResult.rowCount ?? 0;
    }

    // Carry forward: 기존 요약 + AI 필드 복원 (stable_id 일치 시)
    if (summaryMap.size > 0) {
      const sids: string[] = [];
      const titles: string[] = [];
      const summaries: string[] = [];
      const categories: string[] = [];
      const qualityScores: (number | null)[] = [];
      const aiKeywordsArr: string[][] = [];
      const sentiments: (string | null)[] = [];
      for (const issue of issues) {
        const prev = summaryMap.get(issue.stableId);
        if (prev) {
          sids.push(issue.stableId);
          titles.push(prev.title);
          summaries.push(prev.summary);
          categories.push(prev.categoryLabel);
          qualityScores.push(prev.qualityScore);
          aiKeywordsArr.push(prev.aiKeywords);
          sentiments.push(prev.sentiment);
        }
      }
      if (sids.length > 0) {
        for (let k = 0; k < sids.length; k++) {
          await client.query(
            `UPDATE issue_rankings
             SET title = $1, summary = $2, category_label = $3,
                 quality_score = $4, ai_keywords = $5, sentiment = $6
             WHERE stable_id = $7 AND window_hours = $8 AND summary IS NULL`,
            [titles[k], summaries[k], categories[k], qualityScores[k], aiKeywordsArr[k], sentiments[k], sids[k], windowHours],
          );
        }
        console.log(`[issueAggregator] restored ${sids.length} summaries via carry-forward`);
      }
    }

    await client.query('COMMIT');
    console.log(`[issueAggregator] ${inserted} issues ranked (incremental)`);
    return inserted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Hourly Snapshot ───

export async function snapshotRankings(pool: Pool): Promise<void> {
  const batchId = new Date().toISOString();

  // Snapshot current rankings into history (12h 기본 윈도우만)
  const { rowCount } = await pool.query(
    `INSERT INTO issue_rankings_history (batch_id, rank_position, title, issue_score, momentum_score, stable_id, cluster_ids, standalone_post_ids)
     SELECT $1, ROW_NUMBER() OVER (ORDER BY issue_score DESC), title, issue_score, COALESCE(momentum_score, 1.0), stable_id, cluster_ids, standalone_post_ids
     FROM issue_rankings WHERE expires_at > NOW() AND window_hours = 12`,
    [batchId],
  );
  if (rowCount && rowCount > 0) {
    console.log(`[issueAggregator] snapshot: ${rowCount} rankings saved (batch ${batchId})`);
  }

  // Cleanup: remove snapshots older than 7 days
  await pool.query(
    `DELETE FROM issue_rankings_history WHERE created_at < NOW() - INTERVAL '7 days'`,
  );
}

// ─── Cleanup ───

export async function cleanExpiredIssueRankings(pool: Pool): Promise<number> {
  const result = await pool.query('DELETE FROM issue_rankings WHERE expires_at < NOW()');
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) console.log(`[issueAggregator] cleaned ${deleted} expired issue rankings`);
  return deleted;
}

// ─── Materialized API Response ───

/**
 * 이슈 API 응답을 사전 계산하여 DB에 저장.
 * summarizeAndUpdateIssues 완료 후 호출. API에서는 이 테이블에서 단순 SELECT.
 */
export async function materializeIssueResponse(pool: Pool): Promise<void> {
  // 모든 윈도우 (6h/12h/24h)에 대해 materialized 응답 생성
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

  // 0건이어도 materialized 테이블은 반드시 정리 — 낡은 응답이 무기한 반환되는 버그 방지
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

  // Group by window_hours
  const issuesByWindow = new Map<number, typeof allIssues>();
  for (const issue of allIssues) {
    const arr = issuesByWindow.get(issue.window_hours) ?? [];
    arr.push(issue);
    issuesByWindow.set(issue.window_hours, arr);
  }

  // Collect all post IDs across all windows
  const allClusterIds = new Set<number>();
  const allStandaloneIds = new Set<number>();
  for (const issue of allIssues) {
    for (const cid of issue.cluster_ids) allClusterIds.add(cid);
    for (const pid of issue.standalone_post_ids) allStandaloneIds.add(pid);
  }

  // Fetch cluster members
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

  // Gather all post IDs
  const allPostIds = new Set<number>();
  for (const issue of allIssues) {
    for (const cid of issue.cluster_ids) {
      for (const pid of clusterPostMap.get(cid) ?? []) allPostIds.add(pid);
    }
    for (const pid of issue.standalone_post_ids) allPostIds.add(pid);
  }

  // Fetch all posts
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

        const responseJson = {
          issues: responseIssues,
          total: issues.length,
          calculated_at: issues[0]?.calculated_at ?? null,
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
