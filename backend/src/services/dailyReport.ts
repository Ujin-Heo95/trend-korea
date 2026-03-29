import type { Pool } from 'pg';
import { summarizePost, summarizeCategory } from './gemini.js';

const CATEGORIES = [
  'news', 'tech', 'community', 'finance', 'trend',
  'video', 'government', 'deals', 'newsletter', 'alert',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  news: '뉴스', tech: '테크', community: '커뮤니티',
  finance: '금융', trend: '트렌드', video: '영상',
  government: '정부', deals: '핫딜', newsletter: '뉴스레터', alert: '속보',
};

const CATEGORY_EMOJI: Record<string, string> = {
  news: '📰', tech: '💻', community: '💬', finance: '💰',
  trend: '📈', video: '🎬', government: '🏛️', deals: '🛒',
  newsletter: '📧', alert: '🚨',
};

const TOP_N = 5;

interface RankedPost {
  id: number;
  title: string;
  url: string;
  source_name: string;
  view_count: number;
  comment_count: number;
  category: string;
  trend_score: number;
  cluster_size: number;
}

interface SectionRow {
  category: string;
  rank: number;
  postId: number;
  title: string;
  url: string;
  sourceName: string;
  viewCount: number;
  commentCount: number;
  clusterSize: number;
  summary: string | null;
  categorySummary: string | null;
}

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
function getKSTDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

async function queryTopPosts(pool: Pool): Promise<RankedPost[]> {
  const { rows } = await pool.query<RankedPost>(`
    WITH ranked AS (
      SELECT p.id, p.title, p.url, p.source_name,
             p.view_count, p.comment_count, p.category,
             ps.trend_score,
             COALESCE(pc.member_count, 1) AS cluster_size,
             ROW_NUMBER() OVER (
               PARTITION BY p.category ORDER BY ps.trend_score DESC
             ) AS rn
      FROM posts p
      JOIN post_scores ps ON ps.post_id = p.id
      LEFT JOIN post_clusters pc ON pc.canonical_post_id = p.id
      WHERE p.scraped_at > NOW() - INTERVAL '24 hours'
        AND p.category IS NOT NULL
    )
    SELECT id, title, url, source_name, view_count, comment_count,
           category, trend_score, cluster_size
    FROM ranked
    WHERE rn <= $1
    ORDER BY category, rn
  `, [TOP_N]);

  return rows;
}

function groupByCategory(posts: readonly RankedPost[]): Map<string, RankedPost[]> {
  const groups = new Map<string, RankedPost[]>();
  for (const post of posts) {
    const existing = groups.get(post.category);
    if (existing) {
      existing.push(post);
    } else {
      groups.set(post.category, [post]);
    }
  }
  return groups;
}

async function buildSections(
  grouped: Map<string, RankedPost[]>,
): Promise<SectionRow[]> {
  const sections: SectionRow[] = [];

  for (const cat of CATEGORIES) {
    const posts = grouped.get(cat);
    if (!posts || posts.length === 0) continue;

    // 카테고리 종합 요약
    const catSummary = await summarizeCategory(
      CATEGORY_LABELS[cat] ?? cat,
      posts.map(p => p.title),
    );

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const postSummary = await summarizePost(post.title, post.source_name);

      sections.push({
        category: cat,
        rank: i + 1,
        postId: post.id,
        title: post.title,
        url: post.url,
        sourceName: post.source_name,
        viewCount: post.view_count,
        commentCount: post.comment_count,
        clusterSize: post.cluster_size,
        summary: postSummary,
        categorySummary: i === 0 ? catSummary : null,
      });
    }
  }

  return sections;
}

function formatNumber(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return String(n);
}

export async function generateDailyReport(pool: Pool): Promise<number> {
  const reportDate = getKSTDateString();

  // 중복 체크
  const existing = await pool.query(
    'SELECT id FROM daily_reports WHERE report_date = $1',
    [reportDate],
  );
  if (existing.rows.length > 0) {
    console.log(`[daily-report] ${reportDate} already exists, skipping`);
    return existing.rows[0].id;
  }

  // draft 생성
  const { rows: [report] } = await pool.query(
    `INSERT INTO daily_reports (report_date, status) VALUES ($1, 'draft') RETURNING id`,
    [reportDate],
  );
  const reportId: number = report.id;

  try {
    // Top 5 per category 조회
    const topPosts = await queryTopPosts(pool);
    const grouped = groupByCategory(topPosts);

    // LLM 요약 + 섹션 구성
    const sections = await buildSections(grouped);

    if (sections.length === 0) {
      await pool.query(
        `UPDATE daily_reports SET status = 'published', generated_at = NOW() WHERE id = $1`,
        [reportId],
      );
      console.log(`[daily-report] ${reportDate} published (empty — no posts in last 24h)`);
      return reportId;
    }

    // sections INSERT
    const insertValues: string[] = [];
    const insertParams: unknown[] = [];
    for (const s of sections) {
      const i = insertParams.length;
      insertParams.push(
        reportId, s.category, s.rank, s.postId,
        s.title, s.url, s.sourceName,
        s.viewCount, s.commentCount, s.clusterSize,
        s.summary, s.categorySummary,
      );
      insertValues.push(
        `($${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},$${i + 8},$${i + 9},$${i + 10},$${i + 11},$${i + 12})`,
      );
    }

    await pool.query(
      `INSERT INTO daily_report_sections
       (report_id, category, rank, post_id, title, url, source_name, view_count, comment_count, cluster_size, summary, category_summary)
       VALUES ${insertValues.join(',')}`,
      insertParams,
    );

    // published
    await pool.query(
      `UPDATE daily_reports SET status = 'published', generated_at = NOW() WHERE id = $1`,
      [reportId],
    );

    console.log(`[daily-report] ${reportDate} published (${sections.length} sections)`);
    return reportId;
  } catch (err) {
    await pool.query(
      `UPDATE daily_reports SET status = 'failed' WHERE id = $1`,
      [reportId],
    );
    console.error('[daily-report] generation failed:', err);
    throw err;
  }
}
