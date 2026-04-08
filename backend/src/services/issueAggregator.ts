import type { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';
import { buildKeywordIndex, matchPostToKeywords, computeTrendSignalBonus } from './trendSignals.js';
import { getChannel } from './scoring-weights.js';
import { bigrams, jaccardSimilarity, koreanTokenize, wordJaccardSimilarity } from './dedup.js';
import { cosineSimilarity as embeddingCosine } from './embedding.js';
import { getScoringConfig } from './scoringConfig.js';

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
      console.warn('[issueAggregator] skipping — previous run still active');
      return 0;
    }
    console.warn(`[issueAggregator] force-releasing stale lock (${Math.round(elapsed / 1000)}s old)`);
    isAggregating = false;
  }
  isAggregating = true;
  aggregationStartedAt = Date.now();
  try {
    return await _aggregateIssues(pool);
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
       AND COALESCE(category, '') IN ('news','press','community','video','video_popular')`,
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
  const dedupedGroups = deduplicateIssuesByTitle(mergedGroups, cfg.issueDedupThreshold);

  // Step 4: Filter and score (includes video)
  const scoredIssues = scoreAndFilter(dedupedGroups, cfg);

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
      AND COALESCE(p.category, '') IN ('news', 'press', 'community', 'video', 'video_popular')
    ORDER BY COALESCE(ps.trend_score, 0) DESC
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

  for (const indices of kwToGroups.values()) {
    for (let i = 1; i < indices.length; i++) {
      union(indices[0], indices[i]);
    }
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

function deduplicateIssuesByTitle(groups: readonly IssueGroup[], threshold: number): IssueGroup[] {
  if (groups.length <= 1) return [...groups];

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

  const HIGH_CONFIDENCE_THRESHOLD = 0.65;
  const WORD_HIGH_CONF = 0.6;   // word-level은 bigram보다 관대 (의미 단위)
  const SNIPPET_WEIGHT = 0.3;   // 스니펫 블렌딩 비율

  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (find(i) === find(j)) continue;

      // 1) Bigram 유사도 (기존)
      const bigramSim = jaccardSimilarity(bigramSets[i], bigramSets[j]);

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

      // 5단계 신뢰도 기반 병합
      const highConf = bigramSim >= HIGH_CONFIDENCE_THRESHOLD;   // bigram 확실
      const wordHighConf = titleWordSim >= WORD_HIGH_CONF;       // word 의미적 확실
      const embHighConf = embSim >= 0.80;                        // 임베딩 의미적 확실
      const medConf = bestSim >= threshold && sharedKw >= 1;     // 유사 + 키워드 보강
      const kwOnly = sharedKw >= 3;                              // 키워드 3개↑ 공유

      if (highConf || wordHighConf || embHighConf || medConf || kwOnly) {
        union(i, j);
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

  return [...merged.values()];
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

    // Carry forward: 기존 요약을 stable_id 기준으로 보존
    const { rows: existingSummaries } = await client.query<{
      stable_id: string; title: string; summary: string; category_label: string;
    }>(
      `SELECT stable_id, title, summary, category_label
       FROM issue_rankings
       WHERE summary IS NOT NULL AND stable_id IS NOT NULL`,
    );
    const summaryMap = new Map(
      existingSummaries.map(r => [r.stable_id, {
        title: r.title, summary: r.summary, categoryLabel: r.category_label,
      }]),
    );

    await client.query('TRUNCATE issue_rankings');

    const values: string[] = [];
    const params: unknown[] = [];
    for (const issue of issues) {
      // 동적 TTL: momentum 낮은 이슈(≤0.7)는 2시간, 나머지는 기본 6시간
      const isStale = issue.momentumScore <= 0.7;
      const ttlMs = kstHour >= 1 && kstHour < 6
        ? quietTtlMs
        : isStale ? 2 * 60 * 60 * 1000 : baseTtlMs;

      const i = params.length;
      values.push(
        `($${i+1},$${i+2},$${i+3},$${i+4},$${i+5},$${i+6},$${i+7},$${i+8},$${i+9},$${i+10},$${i+11},$${i+12},$${i+13},$${i+14},$${i+15},$${i+16},$${i+17},$${i+18},NOW(),NOW()+$${i+19}::interval)`,
      );
      params.push(
        issue.title,                    // 1
        issue.summary,                  // 2
        issue.categoryLabel,            // 3
        issue.issueScore,               // 4
        issue.newsScore,                // 5
        issue.communityScore,           // 6
        issue.trendSignalScore,         // 7
        issue.videoScore,               // 8
        issue.momentumScore,            // 9
        issue.newsPostCount,            // 10
        issue.communityPostCount,       // 11
        issue.videoPostCount,           // 12
        issue.representativeThumbnail,  // 13
        issue.clusterIds,               // 14
        issue.standalonePostIds,        // 15
        issue.matchedTrendKeywords,     // 16
        null,                           // 17  rank_change (computed at API time)
        issue.stableId,                 // 18
        `${ttlMs} milliseconds`,        // 19
      );
    }

    const result = await client.query(
      `INSERT INTO issue_rankings
        (title, summary, category_label, issue_score, news_score, community_score,
         trend_signal_score, video_score, momentum_score, news_post_count, community_post_count,
         video_post_count, representative_thumbnail, cluster_ids, standalone_post_ids,
         matched_trend_keywords, rank_change, stable_id, calculated_at, expires_at)
       VALUES ${values.join(',')}`,
      params,
    );

    // Carry forward: 기존 요약 복원 (stable_id 일치 시)
    if (summaryMap.size > 0) {
      const sids: string[] = [];
      const titles: string[] = [];
      const summaries: string[] = [];
      const categories: string[] = [];
      for (const issue of issues) {
        const prev = summaryMap.get(issue.stableId);
        if (prev) {
          sids.push(issue.stableId);
          titles.push(prev.title);
          summaries.push(prev.summary);
          categories.push(prev.categoryLabel);
        }
      }
      if (sids.length > 0) {
        await client.query(
          `UPDATE issue_rankings ir
           SET title = v.title, summary = v.summary, category_label = v.cat
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
             AS v(sid, title, summary, cat)
           WHERE ir.stable_id = v.sid AND ir.summary IS NULL`,
          [sids, titles, summaries, categories],
        );
        console.log(`[issueAggregator] restored ${sids.length} summaries via carry-forward`);
      }
    }

    await client.query('COMMIT');
    const inserted = result.rowCount ?? 0;
    console.log(`[issueAggregator] ${inserted} issues ranked`);
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
