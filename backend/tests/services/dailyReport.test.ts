import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock gemini service — always return null (no LLM)
vi.mock('../../src/services/gemini.js', () => ({
  summarizePost: vi.fn().mockResolvedValue(null),
  summarizeCategory: vi.fn().mockResolvedValue(null),
  generateEditorial: vi.fn().mockResolvedValue(null),
}));

function createMockPool(topPosts: any[] = [], existingReport: any = null) {
  let insertedReport: any = null;
  let insertedSections = false;
  let finalStatus = '';

  const query = vi.fn().mockImplementation((sql: string, params?: any[]) => {
    // Check existing report
    if (sql.includes('SELECT id FROM daily_reports WHERE report_date')) {
      return { rows: existingReport ? [existingReport] : [] };
    }
    // Insert draft
    if (sql.includes('INSERT INTO daily_reports')) {
      insertedReport = { id: 1 };
      return { rows: [{ id: 1 }] };
    }
    // Top posts query (WITH ranked)
    if (sql.includes('WITH ranked')) {
      return { rows: topPosts };
    }
    // Insert sections
    if (sql.includes('INSERT INTO daily_report_sections')) {
      insertedSections = true;
      return { rowCount: topPosts.length };
    }
    // Update status
    if (sql.includes('UPDATE daily_reports')) {
      if (sql.includes("'published'") || sql.includes('published')) finalStatus = 'published';
      else if (sql.includes("'failed'") || sql.includes('failed')) finalStatus = 'failed';
      return { rowCount: 1 };
    }
    return { rows: [] };
  });

  return {
    pool: { query } as any,
    getState: () => ({ insertedReport, insertedSections, finalStatus }),
  };
}

const SAMPLE_POSTS = [
  {
    id: 1, title: '삼성 주가 급등', url: 'https://example.com/1',
    source_name: '연합뉴스', view_count: 5000, comment_count: 200,
    category: 'finance', trend_score: 95.5, cluster_size: 3,
  },
  {
    id: 2, title: '아이폰 신모델 출시', url: 'https://example.com/2',
    source_name: 'SBS', view_count: 3000, comment_count: 100,
    category: 'tech', trend_score: 80.2, cluster_size: 1,
  },
];

describe('generateDailyReport', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('skips if report already exists for today', async () => {
    const { pool } = createMockPool([], { id: 42 });
    const { generateDailyReport } = await import('../../src/services/dailyReport.js');

    const id = await generateDailyReport(pool);
    expect(id).toBe(42);
  });

  it('creates report with sections and publishes', async () => {
    const { pool, getState } = createMockPool(SAMPLE_POSTS);
    const { generateDailyReport } = await import('../../src/services/dailyReport.js');

    const id = await generateDailyReport(pool);
    expect(id).toBe(1);

    const state = getState();
    expect(state.insertedSections).toBe(true);
    expect(state.finalStatus).toBe('published');
  });

  it('publishes empty report when no posts found', async () => {
    const { pool, getState } = createMockPool([]);
    const { generateDailyReport } = await import('../../src/services/dailyReport.js');

    await generateDailyReport(pool);
    expect(getState().finalStatus).toBe('published');
  });

  it('sets status to failed on error', async () => {
    const failPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // no existing report
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // insert draft
        .mockRejectedValueOnce(new Error('DB error')) // top posts query fails
        .mockResolvedValueOnce({ rowCount: 1 }), // update to failed
    } as any;

    const { generateDailyReport } = await import('../../src/services/dailyReport.js');

    await expect(generateDailyReport(failPool)).rejects.toThrow('DB error');
    expect(failPool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      [1],
    );
  });
});
