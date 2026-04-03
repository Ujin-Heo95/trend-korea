import { Pool } from 'pg';
import { generateMiniBriefing } from './gemini.js';

/**
 * 현재 인기 키워드 기반으로 미니 에디토리얼 생성 → mini_editorials 저장
 */
export async function generateMiniEditorial(pool: Pool): Promise<void> {
  // 상위 8개 키워드 + 관련 포스트 수 조회 (3h 윈도우)
  const { rows: topKeywords } = await pool.query<{
    keyword: string;
    mention_count: number;
  }>(
    `SELECT keyword, mention_count
     FROM keyword_stats
     WHERE window_hours = 3
     ORDER BY mention_count DESC
     LIMIT 8`,
  );

  if (topKeywords.length < 3) {
    console.log('[mini-editorial] not enough keywords for briefing');
    return;
  }

  // 각 키워드를 토픽으로 변환
  const topics = topKeywords.map(kw => ({
    headline: kw.keyword,
    keywords: [kw.keyword],
    postCount: kw.mention_count,
  }));

  const result = await generateMiniBriefing(topics);
  if (!result) {
    console.warn('[mini-editorial] Gemini returned null');
    return;
  }

  await pool.query(
    `INSERT INTO mini_editorials (briefing, keywords, topic_count)
     VALUES ($1, $2::text[], $3)`,
    [result.briefing, result.keywords, topics.length],
  );

  // 24시간 이상 된 항목 정리
  await pool.query(`DELETE FROM mini_editorials WHERE created_at < NOW() - INTERVAL '24 hours'`);

  console.log(`[mini-editorial] generated: "${result.briefing.slice(0, 60)}..." (${result.keywords.join(', ')})`);
}
