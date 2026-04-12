import { describe, it, expect } from 'vitest';
import { computeCrossChannelEcho } from '../../../src/services/v8/crossChannelEcho.js';
import type { V8Post } from '../../../src/services/v8/types.js';
import type { PreloadedWeights } from '../../../src/services/scoring-weights.js';

function weights(): PreloadedWeights {
  return {
    sourceWeights: { yna: 2.5, mbc: 2.2, theqoo: 1.0, dcinside: 1.0 },
    defaultSourceWeight: 0.8,
    categoryWeights: {}, defaultCategoryWeight: 1.0,
    communitySourceWeights: {}, defaultCommunitySourceWeight: 1.0,
    communityDecayHalfLives: {}, defaultCommunityDecay: 150,
    channelHalfLives: {}, defaultHalfLife: 300,
    newsDecayHalfLives: {}, defaultNewsDecay: 240,
  };
}

function makePost(id: number, channel: V8Post['channel'], src: string): V8Post {
  return {
    id, title: `p${id}`, url: `u${id}`, sourceKey: src,
    category: channel, channel,
    scrapedAt: new Date('2026-04-13T00:00:00Z'),
    publishedAt: new Date('2026-04-13T00:00:00Z'),
    viewCount: 0, commentCount: 0, likeCount: 0, thumbnailUrl: null,
  };
}

function lookup(map: Map<number, Float32Array>) {
  return (id: number) => map.get(id) ?? null;
}

describe('computeCrossChannelEcho', () => {
  it('isolated post (no neighbors) → echo = 1.0', () => {
    const posts = [makePost(1, 'community', 'theqoo')];
    const vecs = new Map([[1, new Float32Array([1, 0, 0])]]);
    const result = computeCrossChannelEcho(posts, weights(), lookup(vecs));
    expect(result.get(1)!.echo).toBe(1.0);
    expect(result.get(1)!.crossChannelNeighbors).toBe(0);
  });

  it('same-channel neighbors → no echo (must be cross-channel)', () => {
    const posts = [
      makePost(1, 'community', 'theqoo'),
      makePost(2, 'community', 'dcinside'),
    ];
    const v = new Float32Array([1, 0, 0]);
    const result = computeCrossChannelEcho(posts, weights(), lookup(new Map([[1, v], [2, v]])));
    expect(result.get(1)!.echo).toBe(1.0);
    expect(result.get(2)!.echo).toBe(1.0);
  });

  it('community post with news neighbor → echo > 1.0', () => {
    const posts = [
      makePost(1, 'community', 'theqoo'),
      makePost(2, 'news', 'yna'),
    ];
    const v = new Float32Array([1, 0, 0]);
    const result = computeCrossChannelEcho(posts, weights(), lookup(new Map([[1, v], [2, v]])));
    expect(result.get(1)!.echo).toBeGreaterThan(1.0);
    expect(result.get(1)!.crossChannelNeighbors).toBe(1);
    // news 포스트도 community 이웃 덕에 echo 부스트
    expect(result.get(2)!.echo).toBeGreaterThan(1.0);
  });

  it('multiple cross-channel neighbors → larger echo (monotonic)', () => {
    const v = new Float32Array([1, 0, 0]);
    const few = [
      makePost(1, 'community', 'theqoo'),
      makePost(2, 'news', 'yna'),
    ];
    const many = [
      makePost(1, 'community', 'theqoo'),
      makePost(2, 'news', 'yna'),
      makePost(3, 'news', 'mbc'),
      makePost(4, 'video', 'youtube'),
      makePost(5, 'portal', 'daum_news'),
    ];
    const fewResult = computeCrossChannelEcho(
      few, weights(),
      lookup(new Map(few.map(p => [p.id, v]))),
    );
    const manyResult = computeCrossChannelEcho(
      many, weights(),
      lookup(new Map(many.map(p => [p.id, v]))),
    );
    expect(manyResult.get(1)!.echo).toBeGreaterThan(fewResult.get(1)!.echo);
  });

  it('echo capped at 2.0 (no runaway boost)', () => {
    const v = new Float32Array([1, 0, 0]);
    const posts: V8Post[] = [makePost(1, 'community', 'theqoo')];
    for (let i = 2; i <= 50; i++) {
      posts.push(makePost(i, 'news', 'yna'));
    }
    const result = computeCrossChannelEcho(
      posts, weights(),
      lookup(new Map(posts.map(p => [p.id, v]))),
    );
    expect(result.get(1)!.echo).toBeLessThanOrEqual(2.0);
  });

  it('missing embedding → echo = 1.0 (neutral fallback)', () => {
    const posts = [
      makePost(1, 'community', 'theqoo'),
      makePost(2, 'news', 'yna'),
    ];
    const v = new Float32Array([1, 0, 0]);
    const result = computeCrossChannelEcho(
      posts, weights(),
      lookup(new Map([[2, v]])), // post 1 has no embedding
    );
    expect(result.get(1)!.echo).toBe(1.0);
  });
});
