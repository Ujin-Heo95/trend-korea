import { Pool } from 'pg';
import pLimit from 'p-limit';
import { summarizePostsBatch, delay } from './gemini.js';

const SUMMARY_BATCH_SIZE = 10;
const MAX_POSTS_PER_RUN = 200;
const BATCH_DELAY_MS = 500;
const summaryLimit = pLimit(3);

/**
 * 아직 AI 요약이 없는 최근 게시글을 배치로 요약하여 DB에 저장
 */
export async function summarizeNewPosts(pool: Pool): Promise<void> {
  const { rows: pending } = await pool.query<{
    id: number;
    title: string;
    source_name: string;
  }>(
    `SELECT p.id, p.title, p.source_name FROM posts p
     WHERE p.ai_summary IS NULL
       AND p.scraped_at > NOW() - INTERVAL '6 hours'
     ORDER BY p.scraped_at DESC
     LIMIT $1`,
    [MAX_POSTS_PER_RUN],
  );

  if (pending.length === 0) {
    console.log('[summaries] no new posts to summarize');
    return;
  }

  console.log(`[summaries] summarizing ${pending.length} posts (batch=${SUMMARY_BATCH_SIZE})`);
  let totalSummarized = 0;

  const batches: typeof pending[] = [];
  for (let i = 0; i < pending.length; i += SUMMARY_BATCH_SIZE) {
    batches.push(pending.slice(i, i + SUMMARY_BATCH_SIZE));
  }

  for (const batch of batches) {
    const items = batch.map(p => ({ title: p.title, sourceName: p.source_name }));

    const summaries = await summaryLimit(() => summarizePostsBatch(items));

    // 요약이 있는 포스트만 업데이트
    const updates: Promise<void>[] = [];
    for (let j = 0; j < batch.length; j++) {
      const summary = summaries[j];
      if (summary) {
        updates.push(
          pool
            .query(
              `UPDATE posts SET ai_summary = $1, ai_summarized_at = NOW() WHERE id = $2`,
              [summary, batch[j].id],
            )
            .then(() => { totalSummarized++; }),
        );
      }
    }
    await Promise.all(updates);

    // 배치 간 딜레이
    if (batch !== batches[batches.length - 1]) {
      await delay(BATCH_DELAY_MS);
    }
  }

  console.log(`[summaries] summarized ${totalSummarized}/${pending.length} posts`);
}
