import type { Pool } from 'pg';
import { buildKeywordIndex, matchPostToKeywords, computeTrendSignalBonus } from './trendSignals.js';
import { getChannel } from './scoring-weights.js';

// ─── Types ───

interface ScoredPost {
  readonly id: number;
  readonly sourceKey: string;
  readonly category: string | null;
  readonly title: string;
  readonly thumbnail: string | null;
  readonly trendScore: number;
  readonly clusterId: number | null;
}

interface IssueGroup {
  readonly clusterIds: Set<number>;
  readonly standalonePostIds: Set<number>;
  readonly newsPosts: readonly ScoredPost[];
  readonly communityPosts: readonly ScoredPost[];
  readonly matchedKeywords: readonly string[];
  readonly trendSignalScore: number;
}

interface IssueRow {
  readonly title: string;
  readonly summary: string | null;
  readonly categoryLabel: string | null;
  readonly issueScore: number;
  readonly newsScore: number;
  readonly communityScore: number;
  readonly trendSignalScore: number;
  readonly newsPostCount: number;
  readonly communityPostCount: number;
  readonly representativeThumbnail: string | null;
  readonly clusterIds: readonly number[];
  readonly standalonePostIds: readonly number[];
  readonly matchedTrendKeywords: readonly string[];
}

// ─── Constants ───

const ISSUE_WINDOW_HOURS = 12;
const MAX_ISSUES = 30;
const NEWS_WEIGHT = 1.0;
const COMMUNITY_WEIGHT = 0.3;
const TREND_SIGNAL_WEIGHT = 0.5;

// ─── Main Entry Point ───

let isAggregating = false;

export async function aggregateIssues(pool: Pool): Promise<number> {
  if (isAggregating) {
    console.warn('[issueAggregator] skipping — previous run still active');
    return 0;
  }
  isAggregating = true;
  try {
    return await _aggregateIssues(pool);
  } finally {
    isAggregating = false;
  }
}

async function _aggregateIssues(pool: Pool): Promise<number> {
  // Step 1: Fetch scored posts from the last N hours
  const posts = await fetchScoredPosts(pool);
  if (posts.length === 0) return 0;

  // Step 2: Build cluster-based groups
  const clusterGroups = buildClusterGroups(posts);

  // Step 3: Merge related clusters via trend keywords
  const mergedGroups = await mergeViaTrendKeywords(pool, clusterGroups, posts);

  // Step 4: Filter (must have news) and score
  const scoredIssues = scoreAndFilter(mergedGroups);

  // Step 5: Take top N and prepare for summarization
  const topIssues = scoredIssues.slice(0, MAX_ISSUES);

  // Step 6: Try Gemini summarization (handled externally, pass-through here)
  // Summaries are generated separately and cached; here we use canonical title
  const issueRows = topIssues.map(buildIssueRow);

  // Step 7: Write to DB (delete old → insert new, atomic)
  return await writeIssueRankings(pool, issueRows);
}

// ─── Step 1: Fetch Posts ───

async function fetchScoredPosts(pool: Pool): Promise<ScoredPost[]> {
  const { rows } = await pool.query<{
    id: number; source_key: string; category: string | null;
    title: string; thumbnail: string | null; trend_score: number;
    cluster_id: number | null;
  }>(`
    SELECT p.id, p.source_key, p.category, p.title, p.thumbnail,
           COALESCE(ps.trend_score, 0) AS trend_score,
           pcm.cluster_id
    FROM posts p
    LEFT JOIN post_scores ps ON ps.post_id = p.id
    LEFT JOIN post_cluster_members pcm ON pcm.post_id = p.id
    WHERE p.scraped_at > NOW() - INTERVAL '${ISSUE_WINDOW_HOURS} hours'
      AND COALESCE(p.category, '') IN ('news', 'press', 'community')
    ORDER BY COALESCE(ps.trend_score, 0) DESC
  `);

  return rows.map(r => ({
    id: r.id,
    sourceKey: r.source_key,
    category: r.category,
    title: r.title,
    thumbnail: r.thumbnail,
    trendScore: r.trend_score,
    clusterId: r.cluster_id,
  }));
}

// ─── Step 2: Build Cluster Groups ───

interface ClusterGroup {
  clusterId: number | null; // null = standalone
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
  // High-score standalone news posts become their own groups
  for (const post of standalone) {
    const ch = getChannel(post.category);
    if (ch === 'news' && post.trendScore > 0) {
      groups.push({ clusterId: null, posts: [post] });
    }
  }

  return groups;
}

// ─── Step 3: Merge Via Trend Keywords ───

async function mergeViaTrendKeywords(
  pool: Pool,
  groups: ClusterGroup[],
  _allPosts: readonly ScoredPost[],
): Promise<IssueGroup[]> {
  const keywordIndex = await buildKeywordIndex(pool);

  // For each group, find matching trend keywords
  type GroupWithKeywords = { group: ClusterGroup; keywords: Set<string> };
  const groupsWithKw: GroupWithKeywords[] = groups.map(g => {
    const keywords = new Set<string>();
    for (const post of g.posts) {
      const match = matchPostToKeywords(post.title, keywordIndex);
      for (const src of match.matchedSources) {
        // Use source+keyword combo for more precise matching
        keywords.add(src);
      }
      // Also extract matched keyword text for display
      for (const entry of keywordIndex) {
        const m = matchPostToKeywords(post.title, [entry]);
        if (m.matchedSources.size > 0) {
          keywords.add(`kw:${entry.keyword}`);
        }
      }
    }
    return { group: g, keywords };
  });

  // Union-Find for merging groups that share trend keywords
  const parent = Array.from({ length: groupsWithKw.length }, (_, i) => i);

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

  // Build keyword → group index
  const kwToGroups = new Map<string, number[]>();
  for (let i = 0; i < groupsWithKw.length; i++) {
    for (const kw of groupsWithKw[i].keywords) {
      if (!kw.startsWith('kw:')) continue; // Only merge on actual keywords
      const arr = kwToGroups.get(kw) ?? [];
      arr.push(i);
      kwToGroups.set(kw, arr);
    }
  }

  // Merge groups sharing the same keyword
  for (const indices of kwToGroups.values()) {
    for (let i = 1; i < indices.length; i++) {
      union(indices[0], indices[i]);
    }
  }

  // Collect merged groups
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

  // Convert to IssueGroup
  const issueGroups: IssueGroup[] = [];
  for (const { groups: mergedGroupList, keywords } of merged.values()) {
    const clusterIds = new Set<number>();
    const standalonePostIds = new Set<number>();
    const newsPosts: ScoredPost[] = [];
    const communityPosts: ScoredPost[] = [];

    for (const g of mergedGroupList) {
      if (g.clusterId !== null) clusterIds.add(g.clusterId);
      for (const post of g.posts) {
        const ch = getChannel(post.category);
        if (ch === 'news') {
          newsPosts.push(post);
        } else {
          communityPosts.push(post);
        }
        if (g.clusterId === null) standalonePostIds.add(post.id);
      }
    }

    // Extract display keywords
    const matchedKeywords = [...keywords]
      .filter(k => k.startsWith('kw:'))
      .map(k => k.slice(3));

    // Calculate trend signal score from keyword matches
    const representativeTitle = newsPosts[0]?.title ?? communityPosts[0]?.title ?? '';
    const match = matchPostToKeywords(representativeTitle, keywordIndex);
    const trendSignalScore = computeTrendSignalBonus(match) - 1.0; // normalize to 0-based

    issueGroups.push({
      clusterIds,
      standalonePostIds,
      newsPosts,
      communityPosts,
      matchedKeywords,
      trendSignalScore: Math.max(0, trendSignalScore),
    });
  }

  return issueGroups;
}

// ─── Step 4: Score and Filter ───

function scoreAndFilter(groups: readonly IssueGroup[]): IssueGroup[] {
  // Filter: must have at least 1 news post
  const withNews = groups.filter(g => g.newsPosts.length > 0);

  // Score
  const scored = withNews.map(g => {
    const newsScore = g.newsPosts.reduce((sum, p) => sum + p.trendScore, 0);
    const communityScore = g.communityPosts.reduce((sum, p) => sum + p.trendScore, 0);
    const issueScore =
      newsScore * NEWS_WEIGHT +
      communityScore * COMMUNITY_WEIGHT +
      g.trendSignalScore * TREND_SIGNAL_WEIGHT;
    return { group: g, issueScore, newsScore, communityScore };
  });

  // Sort descending
  scored.sort((a, b) => b.issueScore - a.issueScore);

  return scored.map(s => s.group);
}

// ─── Step 5: Build Issue Row ───

function buildIssueRow(group: IssueGroup): IssueRow {
  // Use highest-scoring news post title as default title
  const sortedNews = [...group.newsPosts].sort((a, b) => b.trendScore - a.trendScore);
  const canonicalPost = sortedNews[0];

  const newsScore = group.newsPosts.reduce((sum, p) => sum + p.trendScore, 0);
  const communityScore = group.communityPosts.reduce((sum, p) => sum + p.trendScore, 0);
  const issueScore =
    newsScore * NEWS_WEIGHT +
    communityScore * COMMUNITY_WEIGHT +
    group.trendSignalScore * TREND_SIGNAL_WEIGHT;

  // Derive category label from canonical post
  const categoryLabel = deriveCategoryLabel(canonicalPost?.category);

  // Find best thumbnail
  const thumbnail = canonicalPost?.thumbnail
    ?? group.newsPosts.find(p => p.thumbnail)?.thumbnail
    ?? group.communityPosts.find(p => p.thumbnail)?.thumbnail
    ?? null;

  return {
    title: canonicalPost?.title ?? '알 수 없는 이슈',
    summary: null, // Filled by Gemini summarizer separately
    categoryLabel,
    issueScore,
    newsScore,
    communityScore,
    trendSignalScore: group.trendSignalScore,
    newsPostCount: group.newsPosts.length,
    communityPostCount: group.communityPosts.length,
    representativeThumbnail: thumbnail,
    clusterIds: [...group.clusterIds],
    standalonePostIds: [...group.standalonePostIds],
    matchedTrendKeywords: group.matchedKeywords,
  };
}

function deriveCategoryLabel(category: string | null): string {
  switch (category) {
    case 'news': case 'press': return '뉴스';
    case 'community': return '커뮤니티';
    default: return '종합';
  }
}

// ─── Step 6: Write to DB ───

async function writeIssueRankings(pool: Pool, issues: readonly IssueRow[]): Promise<number> {
  if (issues.length === 0) return 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete previous cycle's rankings (keep only unexpired for cache)
    await client.query(
      `DELETE FROM issue_rankings WHERE calculated_at < NOW() - INTERVAL '10 minutes'`
    );

    // Insert new rankings
    const values: string[] = [];
    const params: unknown[] = [];
    for (const issue of issues) {
      const i = params.length;
      values.push(
        `($${i+1},$${i+2},$${i+3},$${i+4},$${i+5},$${i+6},$${i+7},$${i+8},$${i+9},$${i+10},$${i+11},$${i+12},$${i+13})`
      );
      params.push(
        issue.title,
        issue.summary,
        issue.categoryLabel,
        issue.issueScore,
        issue.newsScore,
        issue.communityScore,
        issue.trendSignalScore,
        issue.newsPostCount,
        issue.communityPostCount,
        issue.representativeThumbnail,
        issue.clusterIds,
        issue.standalonePostIds,
        issue.matchedTrendKeywords,
      );
    }

    const result = await client.query(
      `INSERT INTO issue_rankings
        (title, summary, category_label, issue_score, news_score, community_score,
         trend_signal_score, news_post_count, community_post_count,
         representative_thumbnail, cluster_ids, standalone_post_ids, matched_trend_keywords)
       VALUES ${values.join(',')}`,
      params,
    );

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

// ─── Cleanup ───

export async function cleanExpiredIssueRankings(pool: Pool): Promise<number> {
  const result = await pool.query('DELETE FROM issue_rankings WHERE expires_at < NOW()');
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) console.log(`[issueAggregator] cleaned ${deleted} expired issue rankings`);
  return deleted;
}
