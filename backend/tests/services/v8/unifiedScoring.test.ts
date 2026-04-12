import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeAuthority,
  computeFreshness,
  computeEngagement,
  computeEngagementStats,
  computeTopicImportance,
  computeUnifiedScores,
} from '../../../src/services/v8/unifiedScoring.js';
import type { V8Post, V8Cluster } from '../../../src/services/v8/types.js';
import type { PreloadedWeights } from '../../../src/services/scoring-weights.js';

function makeWeights(overrides: Partial<PreloadedWeights> = {}): PreloadedWeights {
  return {
    sourceWeights: { yna: 2.5, daum_news: 1.8, dcinside: 1.0 },
    defaultSourceWeight: 0.8,
    categoryWeights: {},
    defaultCategoryWeight: 1.0,
    communitySourceWeights: { theqoo: 1.4, dcinside: 1.15, inven: 0.9 },
    defaultCommunitySourceWeight: 1.0,
    communityDecayHalfLives: { theqoo: 150, dcinside: 120 },
    defaultCommunityDecay: 150,
    channelHalfLives: { community: 150, news: 240, video: 360 },
    defaultHalfLife: 300,
    newsDecayHalfLives: { yna: 180, daum_news: 200 },
    defaultNewsDecay: 240,
    ...overrides,
  };
}

function makePost(id: number, partial: Partial<V8Post> = {}): V8Post {
  return {
    id,
    title: `post ${id}`,
    url: `https://example.com/${id}`,
    sourceKey: 'yna',
    category: 'news',
    channel: 'news',
    scrapedAt: new Date('2026-04-13T00:00:00Z'),
    publishedAt: new Date('2026-04-13T00:00:00Z'),
    viewCount: 1000,
    commentCount: 10,
    likeCount: 5,
    thumbnailUrl: null,
    ...partial,
  };
}

describe('computeAuthority', () => {
  const w = makeWeights();

  it('news T1 source yields ~2.5', () => {
    const p = makePost(1, { sourceKey: 'yna', channel: 'news' });
    expect(computeAuthority(p, w)).toBeCloseTo(2.5, 1);
  });

  it('community theqoo yields A-tier (1.4→1.9)', () => {
    const p = makePost(2, { sourceKey: 'theqoo', channel: 'community' });
    expect(computeAuthority(p, w)).toBeCloseTo(1.9, 1);
  });

  it('unknown source falls back to default ≥ 1.0', () => {
    const p = makePost(3, { sourceKey: 'unknown_src' });
    expect(computeAuthority(p, w)).toBeGreaterThanOrEqual(1.0);
  });
});

describe('computeFreshness', () => {
  const w = makeWeights();
  const now = new Date('2026-04-13T04:00:00Z');

  it('fresh post (0 min) → 1.0', () => {
    const p = makePost(1, { publishedAt: new Date('2026-04-13T04:00:00Z'), sourceKey: 'yna', channel: 'news' });
    expect(computeFreshness(p, w, now)).toBeCloseTo(1.0, 2);
  });

  it('news half-life (yna=180min) → 0.5 at 180min', () => {
    const p = makePost(1, { publishedAt: new Date('2026-04-13T01:00:00Z'), sourceKey: 'yna', channel: 'news' });
    expect(computeFreshness(p, w, now)).toBeCloseTo(0.5, 2);
  });

  it('community half-life (theqoo=150min) → 0.5 at 150min', () => {
    const now2 = new Date('2026-04-13T02:30:00Z');
    const p = makePost(1, {
      publishedAt: new Date('2026-04-13T00:00:00Z'),
      sourceKey: 'theqoo',
      channel: 'community',
    });
    expect(computeFreshness(p, w, now2)).toBeCloseTo(0.5, 2);
  });
});

describe('computeEngagement', () => {
  it('higher engagement → higher score within same channel', () => {
    const posts: V8Post[] = [
      makePost(1, { viewCount: 100, commentCount: 1, likeCount: 0, channel: 'community', sourceKey: 'dcinside' }),
      makePost(2, { viewCount: 10000, commentCount: 200, likeCount: 50, channel: 'community', sourceKey: 'dcinside' }),
      makePost(3, { viewCount: 500, commentCount: 10, likeCount: 5, channel: 'community', sourceKey: 'dcinside' }),
    ];
    const stats = computeEngagementStats(posts);
    const low = computeEngagement(posts[0], stats);
    const high = computeEngagement(posts[1], stats);
    expect(high).toBeGreaterThan(low);
  });

  it('result stays in sensible range [0.5, 3.0]', () => {
    const posts: V8Post[] = [makePost(1, { viewCount: 1e9, commentCount: 1e6, likeCount: 1e5 })];
    const stats = computeEngagementStats(posts);
    const score = computeEngagement(posts[0], stats);
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThanOrEqual(3.0);
  });
});

describe('computeTopicImportance', () => {
  it('singleton (no cluster) → 1.0', () => {
    const p = makePost(1);
    const result = computeTopicImportance(p, new Map());
    expect(result).toBe(1.0);
  });

  it('cluster size 10 with 4 channels → > singleton', () => {
    const cluster: V8Cluster = {
      id: 'c1',
      memberPostIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      uniqueSources: 5,
      uniqueChannels: 4,
      channelBreakdown: { community: 3, news: 4, video: 2, portal: 1 },
    };
    const p = makePost(1);
    const idx = new Map([[1, cluster]]);
    expect(computeTopicImportance(p, idx)).toBeGreaterThan(1.5);
  });
});

describe('computeUnifiedScores — end-to-end', () => {
  it('applies the SAME formula to all 4 channels (no channel branching)', () => {
    const w = makeWeights();
    const now = new Date('2026-04-13T04:00:00Z');
    const posts: V8Post[] = [
      makePost(1, { channel: 'news', sourceKey: 'yna' }),
      makePost(2, { channel: 'community', sourceKey: 'theqoo' }),
      makePost(3, { channel: 'video', sourceKey: 'youtube' }),
      makePost(4, { channel: 'portal', sourceKey: 'daum_news', category: 'portal' }),
    ];
    const echo = new Map(posts.map(p => [p.id, { echo: 1.0, crossChannelNeighbors: 0 }]));
    const result = computeUnifiedScores({ posts, weights: w, echo, clusters: [], now });

    expect(result.scores).toHaveLength(4);
    // 모든 채널이 동일한 5개 신호 분해를 가짐
    for (const s of result.scores) {
      expect(s.signals).toHaveProperty('authority');
      expect(s.signals).toHaveProperty('freshness');
      expect(s.signals).toHaveProperty('engagement');
      expect(s.signals).toHaveProperty('topicImportance');
      expect(s.signals).toHaveProperty('crossChannelEcho');
      expect(s.rawScore).toBeGreaterThan(0);
      expect(Number.isFinite(s.normalizedScore)).toBe(true);
    }
  });

  it('higher echo → higher rawScore (cross-channel boost works)', () => {
    const w = makeWeights();
    const now = new Date('2026-04-13T04:00:00Z');
    const baseline = makePost(1, { channel: 'community', sourceKey: 'theqoo' });
    const boosted = makePost(2, { channel: 'community', sourceKey: 'theqoo' });
    const posts = [baseline, boosted];
    const echo = new Map([
      [1, { echo: 1.0, crossChannelNeighbors: 0 }],
      [2, { echo: 1.8, crossChannelNeighbors: 5 }],
    ]);
    const result = computeUnifiedScores({ posts, weights: w, echo, clusters: [], now });
    const s1 = result.scores.find(s => s.postId === 1)!;
    const s2 = result.scores.find(s => s.postId === 2)!;
    expect(s2.rawScore).toBeGreaterThan(s1.rawScore);
  });
});
