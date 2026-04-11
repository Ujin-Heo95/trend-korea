import type { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';
import { notifyPipelineWarning } from './discord.js';
import { buildKeywordIndex, matchPostToKeywords, computeTrendSignalBonus } from './trendSignals.js';
import { getChannel, SCORED_CATEGORIES_SQL } from './scoring-weights.js';
import { bigrams, jaccardSimilarity, koreanTokenize, wordJaccardSimilarity } from './dedup.js';
import { cosineSimilarity as embeddingCosine } from './embedding.js';
import { getScoringConfig } from './scoringConfig.js';
import { config } from '../config/index.js';
import { checkQuota, incrementQuota } from './apiQuota.js';

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

interface IssueGroup {
  readonly clusterIds: Set<number>;
  readonly standalonePostIds: Set<number>;
  readonly newsPosts: readonly ScoredPost[];
  readonly communityPosts: readonly ScoredPost[];
  readonly videoPosts: readonly ScoredPost[];
  readonly matchedKeywords: readonly string[];
  readonly trendSignalScore: number;
}

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
  };
}

// ─── Stable ID ───

function computeStableId(clusterIds: readonly number[], standalonePostIds: readonly number[]): string {
  const key = [...clusterIds].sort().join(',') + '|' + [...standalonePostIds].sort().join(',');
  return createHash('md5').update(key).digest('hex').slice(0, 12);
}

// ─── Main Entry Point ───

let isAggregating = false;
let aggregationStartedAt = 0;
const AGGREGATION_TIMEOUT_MS = 5 * 60_000; // 5분 타임아웃

export async function aggregateIssues(pool: Pool): Promise<number> {
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
      _aggregateIssues(pool),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('[issueAggregator] pipeline timeout after 4min')), 4 * 60_000),
      ),
    ]);
  } finally {
    isAggregating = false;
  }
}

async function _aggregateIssues(pool: Pool): Promise<number> {
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
  }));

  // Step 0.5: Adaptive window — 볼륨 기반 동적 조정 (네이버 36h 적응형 윈도우 응용)
  const { rows: [{ cnt }] } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM posts
     WHERE scraped_at > NOW() - INTERVAL '3 hours'
       AND COALESCE(category, '') IN ${SCORED_CATEGORIES_SQL}`,
  );
  const recentVolume = parseInt(cnt, 10);
  const adaptiveWindow = recentVolume > 200
    ? Math.max(8, cfg.issueWindowHours - 4)   // 고볼륨: 집중 윈도우
    : recentVolume < 50
      ? Math.min(18, cfg.issueWindowHours + 6) // 저볼륨(주말/야간): 확장
      : cfg.issueWindowHours;                  // 평상: 기본값(12h)

  // Step 1: Fetch scored posts (now includes video)
  const posts = await fetchScoredPosts(pool, adaptiveWindow);
  if (posts.length === 0) return 0;

  // Step 2: Build cluster-based groups
  const clusterGroups = buildClusterGroups(posts);

  // Step 3: Merge related clusters via trend keywords
  const mergedGroups = await mergeViaTrendKeywords(pool, clusterGroups);

  // Step 3.5: Deduplicate issues by title similarity
  const { groups: dedupedGroups, borderlinePairs } = deduplicateIssuesByTitle(mergedGroups, cfg.issueDedupThreshold, cfg.containmentThreshold);

  // Step 3.6: AI-assisted borderline dedup (Gemini Flash)
  let finalGroups = dedupedGroups;
  if (borderlinePairs.length > 0) {
    const aiMerges = await geminiDeduplicateBorderline(borderlinePairs);
    if (aiMerges.size > 0) {
      // AI가 병합 판단한 쌍을 추가 적용 (단순 재병합)
      const parent2 = Array.from({ length: finalGroups.length }, (_, i) => i);
      const find2 = (x: number): number => {
        while (parent2[x] !== x) { parent2[x] = parent2[parent2[x]]; x = parent2[x]; }
        return x;
      };
      for (const key of aiMerges) {
        const [iStr, jStr] = key.split(':');
        const a = parseInt(iStr, 10);
        const b = parseInt(jStr, 10);
        if (a < finalGroups.length && b < finalGroups.length) {
          const ra = find2(a);
          const rb = find2(b);
          if (ra !== rb) parent2[ra] = rb;
        }
      }
      const merged2 = new Map<number, IssueGroup>();
      for (let i = 0; i < finalGroups.length; i++) {
        const root = find2(i);
        const existing = merged2.get(root);
        if (!existing) {
          merged2.set(root, finalGroups[i]);
        } else {
          merged2.set(root, {
            clusterIds: new Set([...existing.clusterIds, ...finalGroups[i].clusterIds]),
            standalonePostIds: new Set([...existing.standalonePostIds, ...finalGroups[i].standalonePostIds]),
            newsPosts: [...existing.newsPosts, ...finalGroups[i].newsPosts],
            communityPosts: [...existing.communityPosts, ...finalGroups[i].communityPosts],
            videoPosts: [...existing.videoPosts, ...finalGroups[i].videoPosts],
            matchedKeywords: [...new Set([...existing.matchedKeywords, ...finalGroups[i].matchedKeywords])],
            trendSignalScore: Math.max(existing.trendSignalScore, finalGroups[i].trendSignalScore),
          });
        }
      }
      finalGroups = [...merged2.values()];
    }
  }

  // Step 4: Filter and score (includes video)
  const scoredIssues = scoreAndFilter(finalGroups, cfg);

  // Step 5: Take top N
  const topIssues = scoredIssues.slice(0, cfg.maxIssues);

  // Step 6: Build issue rows with stable IDs (pre-computed scores)
  const issueRows = topIssues.map(si => buildIssueRow(si, cfg));

  // Step 7: Write to DB (delete old → insert new, atomic)
  // rank_change is now computed dynamically at API time (issues.ts / issueRankingDetail.ts)
  return await writeIssueRankings(pool, issueRows);
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
           pcm.cluster_id,
           COALESCE(ps.cluster_bonus, 1.0) AS cluster_bonus,
           p.scraped_at
    FROM posts p
    LEFT JOIN post_scores ps ON ps.post_id = p.id
    LEFT JOIN post_cluster_members pcm ON pcm.post_id = p.id
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

// ─── Core Noun Extraction (음성 증거용) ───

/** 토큰 세트에서 핵심 명사 추출 — 가장 긴 토큰 상위 3개를 주체(subject) 후보로 반환 */
export function extractCoreNouns(tokens: Set<string>): Set<string> {
  // 길이 순 정렬 → 상위 3개 선택 (긴 토큰이 고유명사/핵심어일 확률 높음)
  const sorted = [...tokens].sort((a, b) => b.length - a.length);
  return new Set(sorted.slice(0, 3));
}

// ─── Step 3: Merge Via Trend Keywords ───

async function mergeViaTrendKeywords(
  pool: Pool,
  groups: ClusterGroup[],
): Promise<IssueGroup[]> {
  const keywordIndex = await buildKeywordIndex(pool);

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

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Refuse merge if combined size would exceed limit
    if (groupSize[ra] + groupSize[rb] > MAX_POSTS_PER_ISSUE) return;
    parent[ra] = rb;
    groupSize[rb] += groupSize[ra];
  }

  const MIN_MERGE_KW_LEN = 3; // 2글자 키워드("이란","미국" 등) 병합 제외

  // P2-2: 범용 키워드 불용어 — 단독으로는 병합 트리거 불가
  const GENERIC_MERGE_STOPWORDS = new Set([
    '합의', '발표', '논의', '결정', '관련', '대응', '검토', '추진', '조치', '확인',
    '보도', '전망', '우려', '지적', '요구', '비판', '입장', '계획', '방안', '대책',
    '예정', '가능', '상황', '문제', '사건', '사고', '주장', '의혹', '혐의', '논란',
  ]);

  // ── Pass 1: 키워드 → 그룹 매핑 + 특이성 점수 산출 ──
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

  // P1-2: 키워드 특이성 = 1/sqrt(매칭 그룹 수). 많은 그룹에 매칭 → 범용 → 병합력 약화
  const kwSpecificity = new Map<string, number>();
  for (const [kw, indices] of kwToGroups) {
    kwSpecificity.set(kw, 1.0 / Math.sqrt(indices.length));
  }

  // P1-1: 대표 제목 토큰 세트 사전 계산 (유사도 게이트용)
  const repTitleTokens = groupsWithKw.map(g => {
    const bestPost = g.group.posts.reduce((best, p) =>
      p.trendScore > best.trendScore ? p : best, g.group.posts[0]);
    return koreanTokenize(bestPost.title);
  });

  // ── Pass 2: 후보 쌍별 병합 검증 (유사도 게이트 + 특이성 + 음성 증거) ──
  // 후보 쌍 수집: 같은 키워드를 공유하는 그룹 쌍
  const candidatePairs = new Map<string, { sharedKws: string[]; totalSpecificity: number }>();
  for (const [kw, indices] of kwToGroups) {
    const rawKw = kw.slice(3);
    const isGeneric = GENERIC_MERGE_STOPWORDS.has(rawKw);
    const spec = kwSpecificity.get(kw) ?? 0;

    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const pairKey = `${indices[a]}:${indices[b]}`;
        const existing = candidatePairs.get(pairKey);
        if (existing) {
          existing.sharedKws.push(rawKw);
          // 범용 키워드는 특이성에 기여하지 않음
          if (!isGeneric) existing.totalSpecificity += spec;
        } else {
          candidatePairs.set(pairKey, {
            sharedKws: [rawKw],
            totalSpecificity: isGeneric ? 0 : spec,
          });
        }
      }
    }
  }

  // 각 후보 쌍에 대해 병합 여부 결정
  const MIN_SPECIFICITY_FOR_SINGLE_KW = 0.5; // 4그룹 이하 매칭 키워드만 단독 병합 허용
  const MIN_TITLE_SIM = 0.15;                 // 최소 제목 유사도 (완전 무관한 쌍 차단)

  for (const [pairKey, { sharedKws, totalSpecificity }] of candidatePairs) {
    const [aStr, bStr] = pairKey.split(':');
    const a = Number(aStr);
    const b = Number(bStr);
    if (find(a) === find(b)) continue;

    // P1-2: 단일 키워드이고 특이성 부족하면 병합 거부
    const nonGenericCount = sharedKws.filter(kw => !GENERIC_MERGE_STOPWORDS.has(kw)).length;
    if (nonGenericCount <= 1 && totalSpecificity < MIN_SPECIFICITY_FOR_SINGLE_KW) continue;

    // P1-1: 대표 제목 유사도 게이트
    const titleSim = wordJaccardSimilarity(repTitleTokens[a], repTitleTokens[b]);
    if (titleSim < MIN_TITLE_SIM) {
      // P2-1: 음성 증거 — 핵심명사 겹침도 확인, 없으면 확실히 거부
      // 제목 앞 3어절의 핵심 토큰(주체)을 비교
      const coreA = extractCoreNouns(repTitleTokens[a]);
      const coreB = extractCoreNouns(repTitleTokens[b]);
      let coreOverlap = 0;
      for (const n of coreA) {
        if (coreB.has(n)) coreOverlap++;
      }
      if (coreOverlap === 0) continue; // 핵심명사 겹침 0 → 병합 거부
    }

    union(a, b);
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

// ─── Step 3.5: Deduplicate Issues by Title Similarity ───

interface DedupResult {
  readonly groups: IssueGroup[];
  readonly borderlinePairs: readonly { i: number; j: number; titleA: string; titleB: string }[];
}

function deduplicateIssuesByTitle(groups: readonly IssueGroup[], threshold: number, containmentThreshold: number = 0.60): DedupResult {
  if (groups.length <= 1) return { groups: [...groups], borderlinePairs: [] };

  // 대표 포스트 추출
  const repPosts = groups.map(g =>
    [...g.newsPosts].sort((a, b) => b.trendScore - a.trendScore)[0] ??
    [...g.videoPosts].sort((a, b) => b.trendScore - a.trendScore)[0] ??
    g.communityPosts[0] ?? null,
  );

  // 제목 word token 세트 (한국어 토크나이저 사용)
  const wordSets = repPosts.map(p => p ? koreanTokenize(p.title) : new Set<string>());

  // 스니펫 word token 세트 (있으면 하이브리드 유사도에 사용)
  const snippetSets = repPosts.map(p =>
    p?.contentSnippet ? koreanTokenize(p.contentSnippet) : null,
  );

  // IDF 가중치 계산 — 모든 이슈 제목에서 단어 DF 집계
  const docFreq = new Map<string, number>();
  for (const ws of wordSets) {
    for (const w of ws) {
      docFreq.set(w, (docFreq.get(w) ?? 0) + 1);
    }
  }
  const totalDocs = wordSets.length;
  const idf = new Map<string, number>();
  for (const [word, df] of docFreq) {
    idf.set(word, Math.log(totalDocs / (1 + df)));
  }

  /** IDF 가중 Jaccard: 교집합 IDF 합 / 합집합 IDF 합 */
  function weightedJaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;
    let interSum = 0;
    let unionSum = 0;
    const allWords = new Set([...a, ...b]);
    for (const w of allWords) {
      const weight = idf.get(w) ?? 1;
      const inA = a.has(w) ? 1 : 0;
      const inB = b.has(w) ? 1 : 0;
      interSum += Math.min(inA, inB) * weight;
      unionSum += Math.max(inA, inB) * weight;
    }
    return unionSum === 0 ? 0 : interSum / unionSum;
  }

  // 기존 bigram도 유지 (하위 호환)
  const bigramSets = repPosts.map(p => p ? bigrams(p.title) : new Set<string>());

  const parent = Array.from({ length: groups.length }, (_, i) => i);

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  const HIGH_CONFIDENCE_THRESHOLD = 0.60;
  const WORD_HIGH_CONF = 0.50;  // word-level: 핵심 키워드 3/6 공유 시 병합
  const EMB_HIGH_CONF = 0.80;   // 임베딩: 한국어 정치 뉴스 도메인 유사도 감안 상향
  const SNIPPET_WEIGHT = 0.3;   // 스니펫 블렌딩 비율

  // 경계 케이스 수집 (bestSim 0.25-0.55, 기존 규칙으로 병합되지 않은 쌍)
  const borderlinePairs: { i: number; j: number; titleA: string; titleB: string }[] = [];

  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (find(i) === find(j)) continue;

      // Early-exit: bigram 교집합 0이고, word 교집합도 0이면 관련 없는 이슈
      const bigramSim = jaccardSimilarity(bigramSets[i], bigramSets[j]);
      if (bigramSim === 0 && wordSets[i].size > 0 && wordSets[j].size > 0) {
        let hasWordOverlap = false;
        for (const w of wordSets[i]) {
          if (wordSets[j].has(w)) { hasWordOverlap = true; break; }
        }
        if (!hasWordOverlap) {
          // 키워드 공유 여부도 빠르게 확인
          const kwA = new Set(groups[i].matchedKeywords);
          let hasKwOverlap = false;
          for (const kw of groups[j].matchedKeywords) {
            if (kwA.has(kw)) { hasKwOverlap = true; break; }
          }
          if (!hasKwOverlap) continue;
        }
      }

      // 2) IDF 가중 word 유사도 (신규)
      let titleWordSim = weightedJaccard(wordSets[i], wordSets[j]);

      // 3) 스니펫 하이브리드 — 양쪽 모두 스니펫이 있으면 블렌딩
      if (snippetSets[i] && snippetSets[j]) {
        const snippetSim = wordJaccardSimilarity(snippetSets[i]!, snippetSets[j]!);
        titleWordSim = (1 - SNIPPET_WEIGHT) * titleWordSim + SNIPPET_WEIGHT * snippetSim;
      }

      // 임베딩 코사인 유사도 (있으면)
      const repA = repPosts[i];
      const repB = repPosts[j];
      const embSim = (repA && repB) ? (embeddingCosine(repA.id, repB.id) ?? 0) : 0;

      // 최종 유사도: bigram, word, embedding 중 높은 쪽 채택
      const bestSim = Math.max(bigramSim, titleWordSim, embSim);

      const kwA = new Set(groups[i].matchedKeywords);
      const kwB = groups[j].matchedKeywords;
      let sharedKw = 0;
      for (const kw of kwB) {
        if (kwA.has(kw)) sharedKw++;
      }

      // 6) Token containment ratio — 짧은 제목 토큰의 N%가 긴 제목에 포함되는지
      const minSize = Math.min(wordSets[i].size, wordSets[j].size);
      let wordIntersection = 0;
      const [smaller, larger] = wordSets[i].size <= wordSets[j].size
        ? [wordSets[i], wordSets[j]] : [wordSets[j], wordSets[i]];
      for (const w of smaller) {
        if (larger.has(w)) wordIntersection++;
      }
      const containment = minSize > 0 ? wordIntersection / minSize : 0;

      // 6단계 신뢰도 기반 병합
      const highConf = bigramSim >= HIGH_CONFIDENCE_THRESHOLD;   // bigram 확실
      const wordHighConf = titleWordSim >= WORD_HIGH_CONF;       // word 의미적 확실
      const embHighConf = embSim >= EMB_HIGH_CONF;                 // 임베딩 의미적 확실
      const medConf = bestSim >= threshold && sharedKw >= 1;     // 유사 + 키워드 보강
      const kwOnly = sharedKw >= 3;                              // 키워드 3개↑ 공유
      const contained = containment >= containmentThreshold && bestSim >= 0.35; // 포함도 높음 + 최소 유사도

      if (highConf || wordHighConf || embHighConf || medConf || kwOnly || contained) {
        union(i, j);
      } else if (bestSim >= 0.25 && bestSim < threshold && repPosts[i] && repPosts[j]) {
        // 경계 케이스: 유사하지만 확실하지 않은 쌍 → Gemini에 판단 위임
        borderlinePairs.push({
          i, j,
          titleA: repPosts[i]!.title,
          titleB: repPosts[j]!.title,
        });
      }
    }
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

  return { groups: [...merged.values()], borderlinePairs };
}

// ─── Gemini Borderline Dedup (경계 케이스 AI 판단) ───

const GEMINI_DEDUP_QUOTA = 1500; // 일일 쿼터 (summarize와 공유)

let geminiDedupClient: GoogleGenerativeAI | null = null;

function getGeminiDedupClient(): GoogleGenerativeAI | null {
  if (!config.geminiApiKey) return null;
  if (!geminiDedupClient) geminiDedupClient = new GoogleGenerativeAI(config.geminiApiKey);
  return geminiDedupClient;
}

/** Gemini Flash로 경계 유사도 쌍의 동일 이슈 여부 판단 */
async function geminiDeduplicateBorderline(
  pairs: readonly { i: number; j: number; titleA: string; titleB: string }[],
): Promise<Set<string>> {
  const mergeSet = new Set<string>(); // "i:j" 형식으로 병합할 쌍
  if (pairs.length === 0) return mergeSet;

  const client = getGeminiDedupClient();
  if (!client) return mergeSet;
  if (!checkQuota('gemini', GEMINI_DEDUP_QUOTA)) return mergeSet;

  // 최대 30쌍씩 배치 (토큰 절약)
  const batch = pairs.slice(0, 30);
  incrementQuota('gemini');

  const pairsText = batch.map((p, idx) =>
    `${idx + 1}. A: "${p.titleA}" / B: "${p.titleB}"`,
  ).join('\n');

  const prompt = `다음 뉴스 제목 쌍들이 같은 이슈(사건/사안)에 대한 것인지 판단하세요.
같은 이슈면 "Y", 다른 이슈면 "N"으로 답하세요.

${pairsText}

JSON 배열만 출력: ["Y", "N", ...]`;

  try {
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
      },
    });

    const text = result.response.text();
    const answers = JSON.parse(text) as string[];
    for (let k = 0; k < Math.min(answers.length, batch.length); k++) {
      if (answers[k]?.toUpperCase() === 'Y') {
        mergeSet.add(`${batch[k].i}:${batch[k].j}`);
      }
    }
    logger.info(`[geminiDedup] ${mergeSet.size}/${batch.length} pairs merged by AI`);
  } catch (err) {
    logger.warn({ err }, '[geminiDedup] Gemini call failed, skipping AI dedup');
  }

  return mergeSet;
}

// ─── Step 4: Score and Filter (Fix 1~6 적용) ───

const LN2 = Math.LN2;
const BREAKING_KEYWORDS = ['속보', '[속보]', '긴급', '[긴급]'];

/** Fix 1: 로그 체감 수익 — 상위 포스트 우선, 추가 포스트는 체감 기여 */
function aggregatePostScores(scores: readonly number[], k: number): number {
  if (scores.length === 0) return 0;
  const sorted = [...scores].sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    total += sorted[i] / (1 + k * Math.log1p(i));
  }
  return total;
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

    const issueScore = rawScore * momentum * diversity * breaking;
    return { group: g, issueScore, momentumScore: momentum };
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

async function writeIssueRankings(pool: Pool, issues: readonly IssueRow[]): Promise<number> {
  if (issues.length === 0) return 0;

  // Quiet hours: extend expires_at if next batch would be in quiet hours
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const baseTtlMs = 6 * 60 * 60 * 1000; // default 6h
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
    const { rows: existingRows } = await client.query<{
      stable_id: string; title: string; summary: string; category_label: string;
      quality_score: number | null; ai_keywords: string[]; sentiment: string | null;
      rank_position: number; cluster_ids: number[]; standalone_post_ids: number[];
    }>(
      `SELECT stable_id, title, summary, category_label,
              quality_score, ai_keywords, sentiment,
              ROW_NUMBER() OVER (ORDER BY issue_score DESC)::int AS rank_position,
              cluster_ids, standalone_post_ids
       FROM issue_rankings
       WHERE expires_at > NOW()`,
    );
    const summaryMap = new Map(
      existingRows.filter(r => r.summary != null && r.stable_id != null && !r.summary.startsWith('관련 기사')).map(r => [r.stable_id, {
        title: r.title, summary: r.summary, categoryLabel: r.category_label,
        qualityScore: r.quality_score, aiKeywords: r.ai_keywords ?? [], sentiment: r.sentiment,
      }]),
    );

    // rank_change 사전계산: stable_id → 이전 순위, fallback으로 50% overlap 매칭
    const computeRankChange = (stableId: string, currentRank: number, clusterIds: readonly number[], standaloneIds: readonly number[]): number | null => {
      if (existingRows.length === 0) return null;
      const byStableId = existingRows.find(r => r.stable_id && r.stable_id === stableId);
      if (byStableId) return byStableId.rank_position - currentRank;
      const currIds = [...clusterIds, ...standaloneIds];
      for (const prev of existingRows) {
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

    // 점진적 업데이트: 새 배치에 없는 기존 이슈는 삭제, 나머지는 UPSERT
    const newStableIds = issues.map(i => i.stableId);
    await client.query(
      `DELETE FROM issue_rankings WHERE stable_id IS NULL OR NOT (stable_id = ANY($1::text[]))`,
      [newStableIds],
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
           matched_trend_keywords, rank_change, stable_id, calculated_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW()+$19::interval)
         ON CONFLICT (stable_id) WHERE stable_id IS NOT NULL DO UPDATE SET
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
          `${ttlMs} milliseconds`,
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
             WHERE stable_id = $7 AND summary IS NULL`,
            [titles[k], summaries[k], categories[k], qualityScores[k], aiKeywordsArr[k], sentiments[k], sids[k]],
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

  // Snapshot current rankings into history
  const { rowCount } = await pool.query(
    `INSERT INTO issue_rankings_history (batch_id, rank_position, title, issue_score, momentum_score, stable_id, cluster_ids, standalone_post_ids)
     SELECT $1, ROW_NUMBER() OVER (ORDER BY issue_score DESC), title, issue_score, COALESCE(momentum_score, 1.0), stable_id, cluster_ids, standalone_post_ids
     FROM issue_rankings WHERE expires_at > NOW()`,
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
  const { rows: issues } = await pool.query<{
    id: number; title: string; summary: string | null; category_label: string | null;
    issue_score: number; momentum_score: number; representative_thumbnail: string | null;
    stable_id: string | null; rank_change: number | null;
    quality_score: number | null; ai_keywords: string[]; sentiment: string | null;
    cluster_ids: number[]; standalone_post_ids: number[];
    matched_trend_keywords: string[]; cross_validation_sources: string[];
    news_post_count: number; community_post_count: number; video_post_count: number;
    calculated_at: string;
  }>(
    `SELECT * FROM issue_rankings
     WHERE expires_at > NOW() AND summary IS NOT NULL
     ORDER BY issue_score DESC`,
  );

  if (issues.length === 0) return;

  // Collect all post IDs
  const allClusterIds = new Set<number>();
  const allStandaloneIds = new Set<number>();
  for (const issue of issues) {
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
  for (const issue of issues) {
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

  // Build response per page
  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(issues.length / PAGE_SIZE);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM issue_rankings_materialized');

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
        `INSERT INTO issue_rankings_materialized (page, page_size, total, response_json, calculated_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [page, PAGE_SIZE, issues.length, JSON.stringify(responseJson)],
      );
    }

    await client.query('COMMIT');
    logger.info(`[materialize] ${totalPages} pages materialized`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.warn({ err }, '[materialize] failed to materialize issue response');
  } finally {
    client.release();
  }
}
