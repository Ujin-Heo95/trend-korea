/**
 * Unified Post Scoring — v8 의 단일 공식.
 *
 *   rawScore = authority × freshness × engagement × topicImportance × crossChannelEcho
 *   normalizedScore = channel 내 log-robust Z-score
 *
 * 채널별 분기 없음. `authority` 가 소스 티어를 전담하므로 T1 뉴스가 자연스럽게 상위.
 * `freshness` 는 채널별 half-life 는 유지 (community 150m / news 240m / video 360m).
 *
 * 입력: 이번 배치 포스트 전체 + preloaded weights + cross-channel echo map + cluster 결과.
 * 출력: 포스트별 V8PostScore.
 */

import type { V8Channel, V8Post, V8PostScore, V8SignalBreakdown, V8Cluster } from './types.js';
import {
  getSourceWeightFrom,
  getCommunitySourceWeightFrom,
  getCommunityHalfLifeFrom,
  getNewsHalfLifeFrom,
  getHalfLifeFrom,
  type PreloadedWeights,
} from '../scoring-weights.js';
import type { EchoResult } from './crossChannelEcho.js';

const LN2 = Math.LN2;

// ─── Signal: Authority ───

export function computeAuthority(post: V8Post, weights: PreloadedWeights): number {
  // 커뮤니티는 community-specific tier (A/B/C/D), 그 외는 소스 티어 직접
  if (post.channel === 'community') {
    const tier = getCommunitySourceWeightFrom(weights, post.sourceKey);
    // tier 0.8~1.4 → authority 1.0~1.75
    return Math.max(1.0, 0.5 + tier);
  }
  const src = getSourceWeightFrom(weights, post.sourceKey);
  // sourceWeight 0.8~2.5 → authority 1.0~2.8
  return Math.max(1.0, src);
}

// ─── Signal: Freshness ───

export function computeFreshness(post: V8Post, weights: PreloadedWeights, now: Date): number {
  const referenceTime = post.publishedAt ?? post.scrapedAt;
  const ageMin = Math.max(0, (now.getTime() - referenceTime.getTime()) / 60_000);

  let halfLife: number;
  if (post.channel === 'community') {
    halfLife = getCommunityHalfLifeFrom(weights, post.sourceKey);
  } else if (post.channel === 'news' || post.channel === 'portal') {
    halfLife = getNewsHalfLifeFrom(weights, post.sourceKey);
  } else {
    halfLife = getHalfLifeFrom(weights, post.channel);
  }

  // 지수 감쇠. 현재 채널 별 decay 로직을 유지하되 단일 공식으로 통합.
  return Math.exp((-LN2 * ageMin) / halfLife);
}

// ─── Signal: Engagement ───

interface EngagementStats {
  readonly meanLog: number;
  readonly stdLog: number;
}

/**
 * 채널별 engagement 통계 (views+comments+likes 로그 합의 Z-score 기반).
 * 채널 내 상대값이 되도록 채널별로 분리.
 */
export function computeEngagementStats(
  posts: readonly V8Post[],
): Map<V8Channel, EngagementStats> {
  const byChannel = new Map<V8Channel, number[]>();
  for (const p of posts) {
    const raw = p.viewCount + 2 * p.commentCount + 3 * p.likeCount;
    const logVal = Math.log1p(raw);
    const arr = byChannel.get(p.channel);
    if (arr) arr.push(logVal);
    else byChannel.set(p.channel, [logVal]);
  }

  const stats = new Map<V8Channel, EngagementStats>();
  for (const [channel, arr] of byChannel) {
    if (arr.length === 0) {
      stats.set(channel, { meanLog: 0, stdLog: 1 });
      continue;
    }
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    const std = Math.sqrt(variance) || 1;
    stats.set(channel, { meanLog: mean, stdLog: std });
  }
  return stats;
}

export function computeEngagement(
  post: V8Post,
  stats: Map<V8Channel, EngagementStats>,
): number {
  const raw = post.viewCount + 2 * post.commentCount + 3 * post.likeCount;
  const logVal = Math.log1p(raw);
  const s = stats.get(post.channel) ?? { meanLog: 0, stdLog: 1 };
  const z = (logVal - s.meanLog) / s.stdLog;
  // Z = [-2, +2] → engagement [0.7, 2.5] (sigmoid-like 클리핑)
  const mapped = 1.0 + Math.tanh(z / 1.5) * 0.75;
  return Math.max(0.5, mapped);
}

// ─── Signal: Topic Importance ───

/**
 * 클러스터 크기 + 소스 다양성 + 채널 다양성 로그 스케일.
 * singleton(클러스터 미소속) = 1.0 (중립).
 */
export function computeTopicImportance(
  post: V8Post,
  postIdToCluster: Map<number, V8Cluster>,
): number {
  const cluster = postIdToCluster.get(post.id);
  if (!cluster) return 1.0;
  const size = cluster.memberPostIds.length;
  if (size <= 1) return 1.0;

  const sizeFactor = Math.log2(1 + size);                    // 2→1.58, 10→3.46
  const sourceDiversity = Math.log2(1 + cluster.uniqueSources); // 2→1.58, 5→2.58
  const channelDiversity = 1.0 + 0.25 * (cluster.uniqueChannels - 1); // 1→1.0, 4→1.75

  // 곱하지 말고 덧셈 후 1.0 하한
  const raw = 1.0 + 0.3 * sizeFactor + 0.25 * sourceDiversity + (channelDiversity - 1.0);
  return Math.max(1.0, raw);
}

// ─── Main: Score All Posts ───

export interface UnifiedScoreBatch {
  readonly scores: readonly V8PostScore[];
  readonly byChannel: Map<V8Channel, V8PostScore[]>;
}

export function computeUnifiedScores(params: {
  posts: readonly V8Post[];
  weights: PreloadedWeights;
  echo: Map<number, EchoResult>;
  clusters: readonly V8Cluster[];
  now?: Date;
}): UnifiedScoreBatch {
  const { posts, weights, echo, clusters } = params;
  const now = params.now ?? new Date();

  // postId → cluster 역인덱스
  const postToCluster = new Map<number, V8Cluster>();
  for (const c of clusters) {
    for (const pid of c.memberPostIds) postToCluster.set(pid, c);
  }

  const engagementStats = computeEngagementStats(posts);

  // 1차: raw score 계산
  const rawScores: { post: V8Post; raw: number; signals: V8SignalBreakdown }[] = [];
  for (const p of posts) {
    const authority = computeAuthority(p, weights);
    const freshness = computeFreshness(p, weights, now);
    const engagement = computeEngagement(p, engagementStats);
    const topicImportance = computeTopicImportance(p, postToCluster);
    const crossChannelEcho = echo.get(p.id)?.echo ?? 1.0;
    const raw = authority * freshness * engagement * topicImportance * crossChannelEcho;
    rawScores.push({
      post: p,
      raw,
      signals: { authority, freshness, engagement, topicImportance, crossChannelEcho },
    });
  }

  // 2차: 채널별 normalize (log Z-score)
  const channelRaw = new Map<V8Channel, number[]>();
  for (const r of rawScores) {
    const arr = channelRaw.get(r.post.channel);
    if (arr) arr.push(Math.log1p(r.raw));
    else channelRaw.set(r.post.channel, [Math.log1p(r.raw)]);
  }
  const channelStats = new Map<V8Channel, { mean: number; std: number }>();
  for (const [ch, arr] of channelRaw) {
    if (arr.length === 0) {
      channelStats.set(ch, { mean: 0, std: 1 });
      continue;
    }
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    const std = Math.sqrt(variance) || 1;
    channelStats.set(ch, { mean, std });
  }

  const scores: V8PostScore[] = [];
  const byChannel = new Map<V8Channel, V8PostScore[]>();
  for (const r of rawScores) {
    const s = channelStats.get(r.post.channel)!;
    const z = (Math.log1p(r.raw) - s.mean) / s.std;
    // Z 를 [0, ~5] 로 시프트하여 상대 비교 가능한 양수 점수
    const normalized = Math.max(0, 2.5 + z);
    const score: V8PostScore = {
      postId: r.post.id,
      channel: r.post.channel,
      rawScore: r.raw,
      normalizedScore: normalized,
      signals: r.signals,
      calculatedAt: now,
    };
    scores.push(score);
    const arr = byChannel.get(r.post.channel);
    if (arr) arr.push(score);
    else byChannel.set(r.post.channel, [score]);
  }

  return { scores, byChannel };
}
