/**
 * Unit test: persistIssueRankings UPSERT SQL 계약
 *
 * Regression: 2026-04-13 — v8 pipeline 이 매 tick DELETE+INSERT 로 summary 를
 * plain title 로 덮어써 isStaleSummary() 가 영원히 false → Gemini 미호출.
 *
 * 본 테스트는 실제 DB 없이 mock Pool 로 SQL 계약을 검증한다:
 *
 *  - seed summary 는 '[fallback] ' prefix → isStaleSummary() 가 stale 로 판정
 *  - UPSERT SQL 에 AI-owned 필드 보존용 CASE 분기 포함
 *  - pipeline-owned 필드는 EXCLUDED 로 갱신
 *  - 사라진 stable_id 는 삭제 쿼리로 제거
 *
 * pg-mem 은 `ON CONFLICT ... WHERE ... DO UPDATE` (partial index inference)
 * 를 파싱하지 못하므로 mock 기반 단위테스트로 유지.
 */
import { describe, it, expect, vi } from 'vitest';
import { persistIssueRankings } from '../../src/services/v8/pipeline.js';
import type { V8IssueCard } from '../../src/services/v8/types.js';
import { isStaleSummary } from '../../src/services/summaryQueue.js';

function makeCard(clusterId: string, title: string, issueScore = 10): V8IssueCard {
  return {
    clusterId,
    title,
    category: 'politics',
    issueScore,
    thumbnail: null,
    topPosts: [],
    cluster: {
      anchorPostId: 1,
      memberPostIds: [1, 2, 3],
      channelBreakdown: { news: 2, community: 1, video: 0, portal: 0 },
    },
  } as unknown as V8IssueCard;
}

interface Captured {
  sql: string;
  params?: readonly unknown[];
}

function makeMockPool(): { pool: any; client: any; captured: Captured[] } {
  const captured: Captured[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      captured.push({ sql, params });
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => client),
  };
  return { pool, client, captured };
}

describe('persistIssueRankings — Gemini summary 보존 SQL 계약', () => {
  it('seed summary 는 [fallback] prefix 이며 isStaleSummary 가 true 를 반환', async () => {
    const { pool, captured } = makeMockPool();

    await persistIssueRankings(pool, [makeCard('cl-1', '원제목', 10)], new Date());

    const insertCall = captured.find(c => c.sql.includes('INSERT INTO issue_rankings'));
    expect(insertCall).toBeDefined();

    // params[1] = summary (INSERT 컬럼 순서상 두 번째)
    const summary = insertCall!.params![1] as string;
    expect(summary).toBe('[fallback] 원제목');
    expect(isStaleSummary(summary)).toBe(true);
  });

  it('UPSERT SQL 은 AI-owned 필드를 [fallback] 이 아닐 때 보존', async () => {
    const { pool, captured } = makeMockPool();

    await persistIssueRankings(pool, [makeCard('cl-1', 'X', 10)], new Date());

    const insertCall = captured.find(c => c.sql.includes('INSERT INTO issue_rankings'));
    const sql = insertCall!.sql;

    // ON CONFLICT 분기 존재 + 부분 유니크 인덱스 inference (WHERE stable_id IS NOT NULL)
    expect(sql).toMatch(/ON CONFLICT \(stable_id, window_hours\) WHERE stable_id IS NOT NULL/);

    // AI-owned 3개 필드는 CASE 분기로 보존
    for (const field of ['title', 'summary', 'category_label']) {
      const re = new RegExp(
        `${field}\\s*=\\s*CASE WHEN issue_rankings\\.summary IS NULL OR issue_rankings\\.summary LIKE '\\[fallback\\]%'`,
      );
      expect(sql).toMatch(re);
    }

    // pipeline-owned 필드는 EXCLUDED 로 무조건 갱신
    for (const field of ['issue_score', 'news_score', 'community_score', 'calculated_at', 'expires_at']) {
      const re = new RegExp(`${field}\\s*=\\s*EXCLUDED\\.${field}`);
      expect(sql).toMatch(re);
    }
  });

  it('현재 tick 에 없는 stable_id 를 삭제하는 쿼리가 UPSERT 이전에 실행됨', async () => {
    const { pool, captured } = makeMockPool();

    await persistIssueRankings(
      pool,
      [makeCard('cl-1', 'A'), makeCard('cl-2', 'B')],
      new Date(),
    );

    const deleteIdx = captured.findIndex(
      c => c.sql.includes('DELETE FROM issue_rankings')
        && c.sql.includes('stable_id IS NULL')
        && c.sql.includes('NOT (stable_id = ANY'),
    );
    const firstInsertIdx = captured.findIndex(c => c.sql.includes('INSERT INTO issue_rankings'));

    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(firstInsertIdx).toBeGreaterThan(deleteIdx);

    // DELETE params 는 현재 stable_id 배열
    expect(captured[deleteIdx].params).toEqual([['cl-1', 'cl-2']]);
  });

  it('empty cards 는 no-op 으로 connect 조차 하지 않음', async () => {
    const { pool, captured } = makeMockPool();

    await persistIssueRankings(pool, [], new Date());

    expect(captured).toHaveLength(0);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('BEGIN/COMMIT 트랜잭션으로 감싼다', async () => {
    const { pool, captured } = makeMockPool();

    await persistIssueRankings(pool, [makeCard('cl-1', 'A')], new Date());

    expect(captured[0].sql).toBe('BEGIN');
    expect(captured[captured.length - 1].sql).toBe('COMMIT');
  });
});
