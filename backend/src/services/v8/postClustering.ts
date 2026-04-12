/**
 * k-NN Post Clustering — 임베딩 기반 단일 클러스터링.
 *
 * 기존 issueAggregator.ts 의 IDF+cosine+entity+bridge-guard 3중 게이트를
 * 단순 코사인 유사도 + 시간창 + 크기 제한으로 대체.
 *
 * 방어선:
 *  1) cos ≥ 0.78 (엄격)
 *  2) |Δt| ≤ 12h
 *  3) 클러스터 max size = 50
 *  4) cross-source ≥ 2 (고립 단일 소스 포스트는 클러스터 아님 = singleton)
 *
 * 알고리즘: brute-force O(N²). N ≤ 4000 (12h 윈도우) 에서 ~2–3s.
 */

import type { V8Channel, V8Post, V8Cluster } from './types.js';
import { cosineSimVectors, getEmbedding as defaultGetEmbedding } from '../embedding.js';

export type EmbeddingLookup = (postId: number) => Float32Array | null;

const CLUSTER_COSINE_THRESHOLD = 0.78;
const CLUSTER_TIME_WINDOW_MS = 12 * 60 * 60 * 1000;
const CLUSTER_MAX_SIZE = 50;
const MIN_UNIQUE_SOURCES = 2;

/** Union-Find (Disjoint Set Union) */
class DSU {
  private parent: number[];
  private rank: number[];
  private size: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
    this.size = new Array(n).fill(1);
  }

  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }

  /** 같은 컴포넌트에 합쳐지며, 합쳐진 크기가 maxSize 초과 시 false (union 취소) */
  union(a: number, b: number, maxSize: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return true;
    if (this.size[ra] + this.size[rb] > maxSize) return false;

    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
      this.size[rb] += this.size[ra];
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
      this.size[ra] += this.size[rb];
    } else {
      this.parent[rb] = ra;
      this.size[ra] += this.size[rb];
      this.rank[ra]++;
    }
    return true;
  }

  componentSize(x: number): number {
    return this.size[this.find(x)];
  }
}

/**
 * 포스트 리스트를 k-NN 클러스터링.
 * 결과: cluster 당 memberPostIds + 다양성 지표. singleton(1개 포스트)도 포함.
 *
 * 단, cross-source ≥ 2 필터는 **issueRanker** 에서 적용 (여기서는 raw 그룹만 반환).
 */
export function clusterPosts(
  posts: readonly V8Post[],
  lookup: EmbeddingLookup = defaultGetEmbedding,
): V8Cluster[] {
  if (posts.length === 0) return [];

  // 1. 임베딩 프리로드
  const vectors = new Map<number, Float32Array>();
  for (const p of posts) {
    const v = lookup(p.id);
    if (v) vectors.set(p.id, v);
  }

  // 2. Union-Find 초기화
  const n = posts.length;
  const dsu = new DSU(n);

  // 3. 쌍별 비교 (brute-force)
  for (let i = 0; i < n; i++) {
    const a = posts[i];
    const va = vectors.get(a.id);
    if (!va) continue;
    for (let j = i + 1; j < n; j++) {
      const b = posts[j];
      const dt = Math.abs(a.scrapedAt.getTime() - b.scrapedAt.getTime());
      if (dt > CLUSTER_TIME_WINDOW_MS) continue;
      const vb = vectors.get(b.id);
      if (!vb) continue;
      const sim = cosineSimVectors(va, vb);
      if (sim < CLUSTER_COSINE_THRESHOLD) continue;
      dsu.union(i, j, CLUSTER_MAX_SIZE);
    }
  }

  // 4. 컴포넌트 수집
  const components = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = dsu.find(i);
    const arr = components.get(root);
    if (arr) arr.push(i);
    else components.set(root, [i]);
  }

  // 5. V8Cluster 변환
  const clusters: V8Cluster[] = [];
  for (const indices of components.values()) {
    const members = indices.map(i => posts[i]);
    const sourceSet = new Set(members.map(p => p.sourceKey));
    const channelSet = new Set(members.map(p => p.channel));
    const channelBreakdown: Record<V8Channel, number> = {
      community: 0,
      news: 0,
      video: 0,
      portal: 0,
    };
    for (const m of members) channelBreakdown[m.channel]++;

    // stable id = 가장 낮은 postId (deterministic)
    const anchorId = Math.min(...members.map(p => p.id));

    clusters.push({
      id: `v8-cluster-${anchorId}`,
      memberPostIds: members.map(p => p.id),
      uniqueSources: sourceSet.size,
      uniqueChannels: channelSet.size,
      channelBreakdown,
    });
  }

  return clusters;
}

/** cross-source ≥ 2 필터 적용 (singleton 제거용 헬퍼) */
export function filterMultiSourceClusters(clusters: readonly V8Cluster[]): V8Cluster[] {
  return clusters.filter(c => c.uniqueSources >= MIN_UNIQUE_SOURCES);
}

export const CLUSTERING_CONSTANTS = {
  CLUSTER_COSINE_THRESHOLD,
  CLUSTER_TIME_WINDOW_MS,
  CLUSTER_MAX_SIZE,
  MIN_UNIQUE_SOURCES,
} as const;
