/**
 * Anchor-based Post Clustering — 임베딩 기반 그리디 클러스터링.
 *
 * 모든 멤버는 클러스터 anchor 와 직접 cosine ≥ THRESHOLD. transitive chain 불가.
 * (이전 single-link DSU 는 A↔B↔C 로 chain drift 가 발생해 무관 source 가
 * 한 cluster 로 뭉쳤음 — 사용자 체감 issue 의 근본 원인.)
 *
 * 방어선:
 *  1) cos(post, anchor) ≥ 0.78
 *  2) |post.t - anchor.t| ≤ 12h
 *  3) 클러스터 max size = 50
 *  4) cross-source ≥ 2 (issueRanker 에서 별도 적용)
 *
 * 알고리즘: 시간순 정렬 → 각 post 가 active anchors 중 best-fit 에 attach,
 * 없으면 신규 anchor 가 됨. O(N × A) where A = active anchors in window.
 */

import type { V8Channel, V8Post, V8Cluster } from './types.js';
import { cosineSimVectors, getEmbedding as defaultGetEmbedding } from '../embedding.js';

export type EmbeddingLookup = (postId: number) => Float32Array | null;

const CLUSTER_COSINE_THRESHOLD = 0.78;
const CLUSTER_TIME_WINDOW_MS = 12 * 60 * 60 * 1000;
const CLUSTER_MAX_SIZE = 50;
const MIN_UNIQUE_SOURCES = 2;

interface AnchorBucket {
  readonly anchorVector: Float32Array;
  readonly anchorTime: number;
  readonly anchorPostId: number;
  readonly memberIndices: number[];
}

/**
 * 포스트 리스트를 anchor-based 클러스터링.
 * 결과: cluster 당 memberPostIds + 다양성 지표. singleton(1개 포스트)도 포함.
 *
 * cross-source ≥ 2 필터는 **issueRanker** 에서 적용 (여기서는 raw 그룹만 반환).
 */
export function clusterPosts(
  posts: readonly V8Post[],
  lookup: EmbeddingLookup = defaultGetEmbedding,
): V8Cluster[] {
  if (posts.length === 0) return [];

  // 시간순 정렬 — anchor 는 항상 가장 오래된 멤버. 입력은 readonly 이므로 새 배열.
  const sorted = [...posts].sort((a, b) => a.scrapedAt.getTime() - b.scrapedAt.getTime());
  const n = sorted.length;

  const vectors: (Float32Array | null)[] = new Array(n);
  const times: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    vectors[k] = lookup(sorted[k].id);
    times[k] = sorted[k].scrapedAt.getTime();
  }

  const buckets: AnchorBucket[] = [];

  // active anchors 의 시작 인덱스 — anchorTime 가 가장 오래된 것부터.
  // 시간순 sorted 이므로 ti 가 증가하면서 windowStart 도 단조 증가.
  let windowStart = 0;

  for (let i = 0; i < n; i++) {
    const va = vectors[i];
    if (!va) {
      // 임베딩 없는 post 는 자기 자신을 anchor 로 (singleton). chain 영향 없음.
      buckets.push({
        anchorVector: new Float32Array(0),
        anchorTime: times[i],
        anchorPostId: sorted[i].id,
        memberIndices: [i],
      });
      continue;
    }
    const ti = times[i];

    // window 밖으로 벗어난 oldest anchors 를 prune (active 후보 줄이기).
    while (windowStart < buckets.length && ti - buckets[windowStart].anchorTime > CLUSTER_TIME_WINDOW_MS) {
      windowStart++;
    }

    // active buckets 중 best-fit anchor 찾기.
    let bestIdx = -1;
    let bestSim = CLUSTER_COSINE_THRESHOLD;
    for (let b = windowStart; b < buckets.length; b++) {
      const bucket = buckets[b];
      if (bucket.anchorVector.length === 0) continue;
      if (bucket.memberIndices.length >= CLUSTER_MAX_SIZE) continue;
      const sim = cosineSimVectors(va, bucket.anchorVector);
      if (sim >= bestSim) {
        bestSim = sim;
        bestIdx = b;
      }
    }

    if (bestIdx >= 0) {
      buckets[bestIdx].memberIndices.push(i);
    } else {
      buckets.push({
        anchorVector: va,
        anchorTime: ti,
        anchorPostId: sorted[i].id,
        memberIndices: [i],
      });
    }
  }

  // V8Cluster 변환
  const clusters: V8Cluster[] = [];
  for (const bucket of buckets) {
    const members = bucket.memberIndices.map(idx => sorted[idx]);
    const sourceSet = new Set(members.map(p => p.sourceKey));
    const channelSet = new Set(members.map(p => p.channel));
    const channelBreakdown: Record<V8Channel, number> = {
      community: 0,
      news: 0,
      video: 0,
      portal: 0,
    };
    for (const m of members) channelBreakdown[m.channel]++;

    // stable id = 가장 낮은 postId (anchor 가 시간상 첫 멤버지만, 동일 시각 멤버가
    // 추가될 수 있으므로 deterministic 위해 min 사용 — 기존 명명규칙 유지).
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
