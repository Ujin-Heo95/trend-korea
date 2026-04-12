import { describe, it, expect } from 'vitest';
import { clusterPosts, filterMultiSourceClusters, CLUSTERING_CONSTANTS } from '../../../src/services/v8/postClustering.js';
import type { V8Post } from '../../../src/services/v8/types.js';

function vec(values: number[]): Float32Array {
  return new Float32Array(values);
}

function lookupFrom(map: Map<number, Float32Array>) {
  return (id: number) => map.get(id) ?? null;
}

function makePost(id: number, partial: Partial<V8Post> = {}): V8Post {
  return {
    id,
    title: `post ${id}`,
    url: `https://ex.com/${id}`,
    sourceKey: `src${id}`,
    category: 'news',
    channel: 'news',
    scrapedAt: new Date('2026-04-13T00:00:00Z'),
    publishedAt: new Date('2026-04-13T00:00:00Z'),
    viewCount: 0,
    commentCount: 0,
    likeCount: 0,
    thumbnailUrl: null,
    ...partial,
  };
}

describe('clusterPosts', () => {
  it('empty input → empty output', () => {
    expect(clusterPosts([])).toEqual([]);
  });

  it('posts below cosine threshold → separate clusters (singletons)', () => {
    const lookup = lookupFrom(new Map([
      [1, vec([1, 0, 0])],
      [2, vec([0, 1, 0])],
    ]));
    const posts = [makePost(1), makePost(2)];
    const clusters = clusterPosts(posts, lookup);
    expect(clusters).toHaveLength(2);
    expect(clusters.every(c => c.memberPostIds.length === 1)).toBe(true);
  });

  it('posts above threshold + different sources → merged', () => {
    const lookup = lookupFrom(new Map([
      [1, vec([1, 0.1, 0])],
      [2, vec([0.99, 0.1, 0])],
    ]));
    const posts = [
      makePost(1, { sourceKey: 'yna' }),
      makePost(2, { sourceKey: 'mbc' }),
    ];
    const clusters = clusterPosts(posts, lookup);
    expect(clusters).toHaveLength(1);
    expect([...clusters[0].memberPostIds].sort()).toEqual([1, 2]);
    expect(clusters[0].uniqueSources).toBe(2);
  });

  it('|Δt| > 12h → 별도 클러스터 (시간창 제약)', () => {
    const lookup = lookupFrom(new Map([
      [1, vec([1, 0, 0])],
      [2, vec([1, 0, 0])],
    ]));
    const posts = [
      makePost(1, { scrapedAt: new Date('2026-04-13T00:00:00Z') }),
      makePost(2, { scrapedAt: new Date('2026-04-13T13:00:00Z') }),
    ];
    const clusters = clusterPosts(posts, lookup);
    expect(clusters).toHaveLength(2);
  });

  it('cross-source ≥ 2 필터: 단일 소스 클러스터 제거', () => {
    const lookup = lookupFrom(new Map([
      [1, vec([1, 0, 0])],
      [2, vec([1, 0, 0])],
    ]));
    const posts = [
      makePost(1, { sourceKey: 'yna' }),
      makePost(2, { sourceKey: 'yna' }),
    ];
    const clusters = clusterPosts(posts, lookup);
    expect(clusters).toHaveLength(1);
    const multi = filterMultiSourceClusters(clusters);
    expect(multi).toHaveLength(0);
  });

  it('constants exported for tuning', () => {
    expect(CLUSTERING_CONSTANTS.CLUSTER_COSINE_THRESHOLD).toBe(0.78);
    expect(CLUSTERING_CONSTANTS.MIN_UNIQUE_SOURCES).toBe(2);
  });
});
