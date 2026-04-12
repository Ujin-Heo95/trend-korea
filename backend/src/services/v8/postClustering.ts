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
 * 알고리즘: brute-force O(N²) with 시간순 정렬 + early-break + same-component skip.
 * N ≈ 2500 (12h 윈도우) 에서 목표 < 10s.
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

  // 1. 시간순 정렬 (early-break 활성화). 입력은 readonly 이므로 새 배열 복사.
  //    내부 인덱스 i, j 는 이 정렬된 배열 기준이며 결과의 stable id 는
  //    원본 post id 를 사용하므로 정렬은 안전.
  const sorted = [...posts].sort((a, b) => a.scrapedAt.getTime() - b.scrapedAt.getTime());
  const n = sorted.length;

  // 2. 임베딩 프리로드 (정렬된 인덱스 → Float32Array, null 포함)
  const vectors: (Float32Array | null)[] = new Array(n);
  const times: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    vectors[k] = lookup(sorted[k].id);
    times[k] = sorted[k].scrapedAt.getTime();
  }

  // 3. Union-Find 초기화
  const dsu = new DSU(n);

  // 4. 쌍별 비교 (brute-force, time-sorted, early-break, same-component skip)
  for (let i = 0; i < n; i++) {
    const va = vectors[i];
    if (!va) continue;
    const ti = times[i];
    for (let j = i + 1; j < n; j++) {
      // time window: 정렬되어 있으므로 j 가 윈도우를 벗어나면 이후도 모두 벗어남 → break
      if (times[j] - ti > CLUSTER_TIME_WINDOW_MS) break;
      // 이미 같은 component → cosine 계산 생략
      if (dsu.find(i) === dsu.find(j)) continue;
      const vb = vectors[j];
      if (!vb) continue;
      const sim = cosineSimVectors(va, vb);
      if (sim < CLUSTER_COSINE_THRESHOLD) continue;
      dsu.union(i, j, CLUSTER_MAX_SIZE);
    }
  }

  // 5. 컴포넌트 수집
  const components = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = dsu.find(i);
    const arr = components.get(root);
    if (arr) arr.push(i);
    else components.set(root, [i]);
  }

  // 6. V8Cluster 변환
  const clusters: V8Cluster[] = [];
  for (const indices of components.values()) {
    const members = indices.map(i => sorted[i]);
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
