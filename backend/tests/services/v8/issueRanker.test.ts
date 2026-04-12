import { describe, it, expect } from 'vitest';
import { rankIssues } from '../../../src/services/v8/issueRanker.js';
import type { V8Cluster, V8Post, V8PostScore } from '../../../src/services/v8/types.js';

function makePost(id: number, ch: V8Post['channel'], title: string, src = 'yna'): V8Post {
  return {
    id,
    title,
    url: `https://ex.com/${id}`,
    sourceKey: src,
    category: ch,
    channel: ch,
    scrapedAt: new Date('2026-04-13T00:00:00Z'),
    publishedAt: new Date('2026-04-13T00:00:00Z'),
    viewCount: 100,
    commentCount: 5,
    likeCount: 2,
    thumbnailUrl: null,
  };
}

function makeScore(postId: number, ch: V8Post['channel'], normalized: number): V8PostScore {
  return {
    postId,
    channel: ch,
    rawScore: normalized,
    normalizedScore: normalized,
    signals: {
      authority: 1,
      freshness: 1,
      engagement: 1,
      topicImportance: 1,
      crossChannelEcho: 1,
    },
    calculatedAt: new Date('2026-04-13T00:00:00Z'),
  };
}

describe('rankIssues', () => {
  it('rejects community-only cluster (no news/portal)', () => {
    const posts = [
      makePost(1, 'community', 'p1', 'theqoo'),
      makePost(2, 'community', 'p2', 'dcinside'),
    ];
    const cluster: V8Cluster = {
      id: 'c1',
      memberPostIds: [1, 2],
      uniqueSources: 2,
      uniqueChannels: 1,
      channelBreakdown: { community: 2, news: 0, video: 0, portal: 0 },
    };
    const scores = [makeScore(1, 'community', 5), makeScore(2, 'community', 4)];
    const cards = rankIssues({ clusters: [cluster], scores, posts });
    expect(cards).toHaveLength(0);
  });

  it('accepts cluster with news ≥ 1', () => {
    const posts = [
      makePost(1, 'news', '정치 속보 A', 'yna'),
      makePost(2, 'community', '관련 글', 'theqoo'),
    ];
    const cluster: V8Cluster = {
      id: 'c1',
      memberPostIds: [1, 2],
      uniqueSources: 2,
      uniqueChannels: 2,
      channelBreakdown: { community: 1, news: 1, video: 0, portal: 0 },
    };
    const scores = [makeScore(1, 'news', 5), makeScore(2, 'community', 4)];
    const cards = rankIssues({ clusters: [cluster], scores, posts });
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toContain('속보');
  });

  it('rejects singleton (uniqueSources=1)', () => {
    const posts = [makePost(1, 'news', '단일', 'yna')];
    const cluster: V8Cluster = {
      id: 'c1',
      memberPostIds: [1],
      uniqueSources: 1,
      uniqueChannels: 1,
      channelBreakdown: { community: 0, news: 1, video: 0, portal: 0 },
    };
    const scores = [makeScore(1, 'news', 5)];
    const cards = rankIssues({ clusters: [cluster], scores, posts });
    expect(cards).toHaveLength(0);
  });

  it('channel_breadth_bonus: 4 채널 클러스터가 2 채널보다 점수 비율 우위', () => {
    const twoChannelPosts = [
      makePost(1, 'news', '뉴스', 'yna'),
      makePost(2, 'community', '커뮤', 'theqoo'),
    ];
    const fourChannelPosts = [
      makePost(3, 'news', '뉴스', 'mbc'),
      makePost(4, 'community', '커뮤', 'dcinside'),
      makePost(5, 'video', '영상', 'youtube'),
      makePost(6, 'portal', '포털', 'daum_news'),
    ];
    const twoCluster: V8Cluster = {
      id: 'c2',
      memberPostIds: [1, 2],
      uniqueSources: 2,
      uniqueChannels: 2,
      channelBreakdown: { community: 1, news: 1, video: 0, portal: 0 },
    };
    const fourCluster: V8Cluster = {
      id: 'c4',
      memberPostIds: [3, 4, 5, 6],
      uniqueSources: 4,
      uniqueChannels: 4,
      channelBreakdown: { community: 1, news: 1, video: 1, portal: 1 },
    };
    // 동일 점수 환경
    const scores = [
      makeScore(1, 'news', 5), makeScore(2, 'community', 5),
      makeScore(3, 'news', 5), makeScore(4, 'community', 5),
      makeScore(5, 'video', 5), makeScore(6, 'portal', 5),
    ];
    const cards = rankIssues({
      clusters: [twoCluster, fourCluster],
      scores,
      posts: [...twoChannelPosts, ...fourChannelPosts],
    });
    expect(cards).toHaveLength(2);
    // 4채널이 첫번째여야 함 (breadth_bonus 1.75 vs 1.25)
    expect(cards[0].clusterId).toBe('c4');
    expect(cards[1].clusterId).toBe('c2');
  });

  it('대표 title 은 news 채널 우선 선택', () => {
    const posts = [
      makePost(1, 'community', '커뮤니티 제목', 'theqoo'),
      makePost(2, 'news', '뉴스 제목 (대표)', 'yna'),
    ];
    const cluster: V8Cluster = {
      id: 'c1',
      memberPostIds: [1, 2],
      uniqueSources: 2,
      uniqueChannels: 2,
      channelBreakdown: { community: 1, news: 1, video: 0, portal: 0 },
    };
    // community 점수가 더 높아도 news 가 대표
    const scores = [makeScore(1, 'community', 10), makeScore(2, 'news', 5)];
    const cards = rankIssues({ clusters: [cluster], scores, posts });
    expect(cards[0].title).toBe('뉴스 제목 (대표)');
  });
});
