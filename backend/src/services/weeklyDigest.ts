import { Pool } from 'pg';
import { generateWeeklyDigest } from './gemini.js';

/**
 * 최근 7일치 daily_reports 에디토리얼을 종합하여 주간 다이제스트 생성
 */
export async function generateAndSaveWeeklyDigest(pool: Pool): Promise<void> {
  // 이번 주 시작일 (월요일)
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((dayOfWeek + 6) % 7));
  monday.setUTCHours(0, 0, 0, 0);
  const weekStart = monday.toISOString().split('T')[0];

  // 이미 생성됐는지 확인
  const { rows: existing } = await pool.query(
    `SELECT id FROM weekly_digests WHERE week_start = $1`,
    [weekStart],
  );
  if (existing.length > 0) {
    console.log(`[weekly-digest] already exists for week ${weekStart}`);
    return;
  }

  // 최근 7일치 에디토리얼 데이터 조회
  const { rows: dailyReports } = await pool.query<{
    report_date: string;
    editorial_keywords: string;
    editorial_briefing: string;
  }>(
    `SELECT report_date::text, editorial_keywords, editorial_briefing
     FROM daily_reports
     WHERE report_date >= $1::date - INTERVAL '7 days'
       AND editorial_keywords IS NOT NULL
       AND editorial_briefing IS NOT NULL
     ORDER BY report_date ASC`,
    [weekStart],
  );

  if (dailyReports.length < 3) {
    console.log(`[weekly-digest] not enough daily reports (${dailyReports.length}/3 minimum)`);
    return;
  }

  const summaries = dailyReports.map(r => ({
    date: r.report_date,
    keywords: r.editorial_keywords,
    briefing: r.editorial_briefing,
  }));

  console.log(`[weekly-digest] generating from ${summaries.length} daily reports (week: ${weekStart})`);

  const result = await generateWeeklyDigest(summaries);
  if (!result) {
    console.error('[weekly-digest] Gemini returned null');
    return;
  }

  await pool.query(
    `INSERT INTO weekly_digests (week_start, digest, top_keywords, outlook)
     VALUES ($1, $2, $3::text[], $4)
     ON CONFLICT (week_start) DO UPDATE SET
       digest = EXCLUDED.digest,
       top_keywords = EXCLUDED.top_keywords,
       outlook = EXCLUDED.outlook,
       created_at = NOW()`,
    [weekStart, result.digest, result.topKeywords, result.outlook],
  );

  console.log(`[weekly-digest] saved for week ${weekStart}: ${result.topKeywords.join(', ')}`);
}
