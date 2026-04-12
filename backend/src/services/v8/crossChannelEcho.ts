/**
 * Cross-Channel Echo Signal — v8 의 핵심 신규 신호.
 *
 * 정의: 포스트 P 가 embedding 공간에서 cos≥0.75 이웃 중
 *   타 채널(community↔news↔video↔portal) 포스트가 얼마나 많은지.
 *
 *   echo(P) = 1.0 + min( alpha × sqrt(otherChannelNeighbors) × avgNeighborAuthority, ECHO_CAP )
 *
 *   - alpha = 0.25 (기본값, DB config 에서 조정 가능)
 *   - ECHO_CAP = 1.0 → 최대 2.0x boost
 *   - 타 채널 이웃이 1개도 없으면 echo = 1.0 (중립)
 *
 * 의도:
 *  - 커뮤니티에서 폭발 중인 주제가 뉴스에서도 다뤄지기 시작하면
 *    그 커뮤니티 포스트 자체 랭킹이 올라가야 한다 (사용자 요구사항).
 *  - 뉴스도 마찬가지로 커뮤니티 반향이 있으면 상위 부스트.
 */

import type { V8Channel, V8Post } from './types.js';
import { cosineSimVectors, getEmbedding as defaultGetEmbedding } from '../embedding.js';
import { getSourceWeightFrom, type PreloadedWeights } from '../scoring-weights.js';

export type EmbeddingLookup = (postId: number) => Float32Array | null;

const ECHO_COSINE_THRESHOLD = 0.75;
const ECHO_ALPHA = 0.25;
const ECHO_CAP = 1.0;

export interface EchoResult {
  readonly echo: number;
  readonly crossChannelNeighbors: number;
}

/**
 * 포스트별 echo 신호 계산.
 * @param posts 이번 배치의 모든 포스트 (채널 무관)
 * @param weights preloaded source weights
 * @returns postId → EchoResult
 */
export function computeCrossChannelEcho(
  posts: readonly V8Post[],
  weights: PreloadedWeights,
  lookup: EmbeddingLookup = defaultGetEmbedding,
): Map<number, EchoResult> {
  const result = new Map<number, EchoResult>();

  // 임베딩 사전 로드 (캐시)
  const embeddings = new Map<number, Float32Array>();
  for (const p of posts) {
    const e = lookup(p.id);
    if (e) embeddings.set(p.id, e);
  }

  for (const post of posts) {
    const ownVec = embeddings.get(post.id);
    if (!ownVec) {
      result.set(post.id, { echo: 1.0, crossChannelNeighbors: 0 });
      continue;
    }

    let otherChannelCount = 0;
    let authoritySum = 0;

    for (const other of posts) {
      if (other.id === post.id) continue;
      if (other.channel === post.channel) continue;
      const otherVec = embeddings.get(other.id);
      if (!otherVec) continue;
      const sim = cosineSimVectors(ownVec, otherVec);
      if (sim < ECHO_COSINE_THRESHOLD) continue;
      otherChannelCount++;
      authoritySum += getSourceWeightFrom(weights, other.sourceKey);
    }

    if (otherChannelCount === 0) {
      result.set(post.id, { echo: 1.0, crossChannelNeighbors: 0 });
      continue;
    }

    const avgAuthority = authoritySum / otherChannelCount;
    const rawBoost = ECHO_ALPHA * Math.sqrt(otherChannelCount) * avgAuthority;
    const echo = 1.0 + Math.min(rawBoost, ECHO_CAP);

    result.set(post.id, { echo, crossChannelNeighbors: otherChannelCount });
  }

  return result;
}
