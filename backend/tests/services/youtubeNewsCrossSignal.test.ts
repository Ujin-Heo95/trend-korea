import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { calculateYoutubeNewsCrossSignal } from '../../src/services/scoring-helpers.js';

/**
 * Scripted fake Pool: returns rows in declared order per query call.
 * Each entry can be a function (for assertions on params) or static rows.
 */
function makeFakePool(scripts: Array<{ rows: unknown[] } | ((sql: string, params?: unknown[]) => { rows: unknown[] })>): Pool {
  let i = 0;
  return {
    query: async (sql: string, params?: unknown[]) => {
      const s = scripts[i++];
      if (typeof s === 'function') return s(sql, params);
      return s ?? { rows: [] };
    },
  } as unknown as Pool;
}

describe('calculateYoutubeNewsCrossSignal', () => {
  it('returns empty map when no youtube news videos', async () => {
    const pool = makeFakePool([{ rows: [] }]);
    const map = await calculateYoutubeNewsCrossSignal(pool);
    expect(map.size).toBe(0);
  });

  it('propagates score via cluster membership to news posts', async () => {
    // Step 1: 1 high-engagement video
    // Step 2: cluster propagation returns video → 2 news posts in cluster (size=3)
    // Step 3b: token fallback not called because video matched cluster
    const pool = makeFakePool([
      // videoRows
      { rows: [
        { id: 100, title: '윤석열 대통령 국정연설 발표', view_count: 500000, comment_count: 1000, like_count: 5000 },
      ]},
      // cluster propagation
      { rows: [
        { video_id: 100, news_post_id: 200, cluster_size: 3 },
        { video_id: 100, news_post_id: 201, cluster_size: 3 },
      ]},
    ]);
    const map = await calculateYoutubeNewsCrossSignal(pool);
    // both news posts should have same score, > 0
    expect(map.get(200)).toBeGreaterThan(0);
    expect(map.get(201)).toBe(map.get(200));
    // ≤ 5 (max 10 × 0.5 discount)
    expect(map.get(200)!).toBeLessThanOrEqual(5);
  });

  it('damps score when cluster size > 20', async () => {
    const pool = makeFakePool([
      { rows: [
        { id: 100, title: '대형 클러스터 사건', view_count: 1000000, comment_count: 5000, like_count: 20000 },
      ]},
      { rows: [
        { video_id: 100, news_post_id: 300, cluster_size: 40 },
      ]},
    ]);
    const map = await calculateYoutubeNewsCrossSignal(pool);
    const damped = map.get(300)!;
    // cluster_size=40 → 점수 × 20/40 = ×0.5, 그리고 ×0.5 final → 원본의 0.25 이하
    expect(damped).toBeGreaterThan(0);
    expect(damped).toBeLessThanOrEqual(2.5); // max 10 × 0.5 × 0.5 = 2.5
  });

  it('falls back to token matching for unclustered videos (≥2 shared tokens)', async () => {
    const pool = makeFakePool([
      // videoRows
      { rows: [
        { id: 100, title: '한동훈 대표 사퇴 표명 회견', view_count: 500000, comment_count: 1000, like_count: 5000 },
      ]},
      // cluster propagation: empty (video not in any cluster)
      { rows: [] },
      // newsRows for token fallback
      { rows: [
        { id: 400, title: '한동훈 사퇴 회견 전문' },          // 3 shared: 한동훈/사퇴/회견
        { id: 401, title: '한동훈 거취 논의' },                // 1 shared: 한동훈 → no match
        { id: 402, title: '국민의힘 대표 사퇴 회견 보도' },    // 2 shared: 사퇴/회견
      ]},
    ]);
    const map = await calculateYoutubeNewsCrossSignal(pool);
    expect(map.get(400)).toBeDefined();
    expect(map.get(402)).toBeDefined();
    expect(map.get(401)).toBeUndefined();
    // token fallback applies 0.6 damp + 0.5 final = 0.3 of base
    expect(map.get(400)!).toBeLessThanOrEqual(1.5); // 10 × 0.3 = 3, but only 1 video → ~max
  });

  it('ignores stopword-only matches', async () => {
    const pool = makeFakePool([
      { rows: [
        { id: 100, title: '오늘 속보 뉴스 단독', view_count: 500000, comment_count: 1000, like_count: 5000 },
      ]},
      { rows: [] },
      { rows: [
        { id: 500, title: '오늘 속보 뉴스 단독 다른 사건' },
      ]},
    ]);
    const map = await calculateYoutubeNewsCrossSignal(pool);
    // 모든 공유 토큰이 stopword라 매칭 0
    expect(map.size).toBe(0);
  });

  it('takes max when multiple videos match same news post', async () => {
    const pool = makeFakePool([
      { rows: [
        { id: 100, title: '사건 발생', view_count: 100, comment_count: 0, like_count: 0 },
        { id: 101, title: '사건 발생', view_count: 1000000, comment_count: 5000, like_count: 20000 },
      ]},
      { rows: [
        { video_id: 100, news_post_id: 600, cluster_size: 2 },
        { video_id: 101, news_post_id: 600, cluster_size: 2 },
      ]},
    ]);
    const map = await calculateYoutubeNewsCrossSignal(pool);
    // 둘 중 max (101 점수가 훨씬 큼) 가 반영되어야 함
    expect(map.get(600)).toBeGreaterThan(2);
  });
});
