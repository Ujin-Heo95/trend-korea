import { describe, it, expect, vi, beforeEach } from 'vitest';

// 임베딩 모듈 stub — 테스트에서 postId 쌍별 코사인 유사도를 제어
const simMap = new Map<string, number>();
function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

vi.mock('../../src/services/embedding.js', () => ({
  cosineSimilarity: (a: number, b: number) => simMap.get(pairKey(a, b)) ?? null,
}));

// mock 이후 import (hoisting 주의)
import type { IssueGroup, ScoredPost } from '../../src/services/issueAggregator.js';
const { __internal__ } = await import('../../src/services/issueAggregator.js');

const { deduplicateIssuesByEmbedding, keywordJaccard, EMBED_MERGE_THRESHOLD, MAX_POSTS_PER_DEDUP_GROUP } = __internal__;

function makeNewsPost(id: number, title = `title-${id}`): ScoredPost {
  return {
    id,
    sourceKey: 'kbs_news',
    category: 'news',
    title,
    contentSnippet: null,
    thumbnail: null,
    trendScore: 10,
    clusterId: null,
    clusterBonus: 1,
    scrapedAt: new Date(),
  };
}

function makeCommunityPost(id: number): ScoredPost {
  return { ...makeNewsPost(id), sourceKey: 'dcinside', category: 'community' };
}

function makeGroup(
  postIds: readonly number[],
  opts: {
    kind?: 'news' | 'community';
    keywords?: readonly string[];
  } = {},
): IssueGroup {
  const { kind = 'news', keywords = [] } = opts;
  const posts = postIds.map(id => (kind === 'news' ? makeNewsPost(id) : makeCommunityPost(id)));
  return {
    clusterIds: new Set(),
    standalonePostIds: new Set(postIds),
    newsPosts: kind === 'news' ? posts : [],
    communityPosts: kind === 'community' ? posts : [],
    videoPosts: [],
    matchedKeywords: keywords,
    trendSignalScore: 0,
  };
}

describe('keywordJaccard', () => {
  it('returns 1 when both empty', () => {
    expect(keywordJaccard([], [])).toBe(1);
  });

  it('returns 0 when one side empty', () => {
    expect(keywordJaccard(['a'], [])).toBe(0);
  });

  it('computes intersection/union ratio', () => {
    // {a,b} ∩ {b,c} = {b}, union = {a,b,c} → 1/3
    expect(keywordJaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
  });

  it('returns 1 for identical sets', () => {
    expect(keywordJaccard(['a', 'b'], ['b', 'a'])).toBe(1);
  });
});

describe('deduplicateIssuesByEmbedding', () => {
  beforeEach(() => {
    simMap.clear();
  });

  it('passes through single group unchanged', () => {
    const groups = [makeGroup([1])];
    expect(deduplicateIssuesByEmbedding(groups)).toHaveLength(1);
  });

  it('merges two groups with cosine ≥ threshold and shared keywords', () => {
    simMap.set(pairKey(1, 2), 0.9);
    const groups = [
      makeGroup([1], { keywords: ['이재명', '정치'] }),
      makeGroup([2], { keywords: ['이재명', '민주당'] }),
    ];
    const result = deduplicateIssuesByEmbedding(groups);
    expect(result).toHaveLength(1);
    expect(result[0].newsPosts).toHaveLength(2);
  });

  it('does not merge below threshold', () => {
    simMap.set(pairKey(1, 2), EMBED_MERGE_THRESHOLD - 0.01);
    const groups = [
      makeGroup([1], { keywords: ['a'] }),
      makeGroup([2], { keywords: ['a'] }),
    ];
    expect(deduplicateIssuesByEmbedding(groups)).toHaveLength(2);
  });

  it('guard A: skips merge when both sides lack news anchor', () => {
    simMap.set(pairKey(1, 2), 0.95);
    const groups = [
      makeGroup([1], { kind: 'community', keywords: ['k'] }),
      makeGroup([2], { kind: 'community', keywords: ['k'] }),
    ];
    expect(deduplicateIssuesByEmbedding(groups)).toHaveLength(2);
  });

  it('guard B: requires strict threshold when keyword jaccard < 0.3', () => {
    // cos=0.85 but zero keyword overlap → must NOT merge
    simMap.set(pairKey(1, 2), 0.85);
    const groups = [
      makeGroup([1], { keywords: ['completely', 'different'] }),
      makeGroup([2], { keywords: ['unrelated', 'topic'] }),
    ];
    expect(deduplicateIssuesByEmbedding(groups)).toHaveLength(2);
  });

  it('guard B: allows merge when cos ≥ strict threshold even without shared keywords', () => {
    simMap.set(pairKey(1, 2), 0.9);
    const groups = [
      makeGroup([1], { keywords: ['x'] }),
      makeGroup([2], { keywords: ['y'] }),
    ];
    expect(deduplicateIssuesByEmbedding(groups)).toHaveLength(1);
  });

  it('guard C: refuses merge that would exceed MAX_POSTS_PER_DEDUP_GROUP', () => {
    const bigIds = Array.from({ length: MAX_POSTS_PER_DEDUP_GROUP }, (_, i) => i + 1);
    const smallIds = [999];
    simMap.set(pairKey(bigIds[0], smallIds[0]), 0.95);
    // note: rep post of big group is bigIds[0] since all have same trendScore
    const groups = [
      makeGroup(bigIds, { keywords: ['k'] }),
      makeGroup(smallIds, { keywords: ['k'] }),
    ];
    const result = deduplicateIssuesByEmbedding(groups);
    // big group already at max → must stay separate
    expect(result).toHaveLength(2);
  });

  it('returns separate groups when cosine is missing (null)', () => {
    // no simMap entry → cosine returns null → no merge
    const groups = [
      makeGroup([1], { keywords: ['k'] }),
      makeGroup([2], { keywords: ['k'] }),
    ];
    expect(deduplicateIssuesByEmbedding(groups)).toHaveLength(2);
  });
});
