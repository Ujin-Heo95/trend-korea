import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import { checkQuota, incrementQuota } from './apiQuota.js';

// ─── Types ───

export interface IssueSummary {
  readonly title: string;
  readonly category: string;
  readonly summary: string;
}

// ─── Cache ───

// Key: sorted cluster_ids + standalone_post_ids hash → summary
const summaryCache = new Map<string, { summary: IssueSummary; cachedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function makeCacheKey(clusterIds: readonly number[], standalonePostIds: readonly number[]): string {
  return [...clusterIds].sort().join(',') + '|' + [...standalonePostIds].sort().join(',');
}

// ─── Gemini Client ───

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (!config.geminiApiKey) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAI;
}

// ─── Prompt ───

const SYSTEM_PROMPT = `당신은 한국 뉴스/커뮤니티 트렌드를 분석하는 편집자입니다.
주어진 게시글 제목들을 분석해서 이 이슈를 간결하게 요약하세요.

규칙:
1. title: 핵심 이슈 제목 (15자 이내, 이모지 1개 허용)
2. category: 사회/경제/정치/IT과학/연예/스포츠/생활/세계 중 1개
3. summary: 2-3문장 요약. 핵심 사실 + 배경 + 영향/의미를 포함. 존댓말(~요) 사용.

JSON만 출력: {"title": "...", "category": "...", "summary": "..."}`;

// ─── Public API ───

export async function summarizeIssue(
  titles: readonly string[],
  clusterIds: readonly number[],
  standalonePostIds: readonly number[],
): Promise<IssueSummary | null> {
  // Check cache
  const cacheKey = makeCacheKey(clusterIds, standalonePostIds);
  const cached = summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.summary;
  }

  const client = getClient();
  if (!client) return null;

  // 일일 쿼터 가드: Gemini API 과도 호출 방지
  if (!checkQuota('gemini', 500)) return null;

  try {
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const titlesText = titles.slice(0, 15).map((t, i) => `${i + 1}. ${t}`).join('\n');

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n게시글 제목들:\n${titlesText}` }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
      },
    });

    const text = result.response.text();
    const parsed = JSON.parse(text) as { title?: string; category?: string; summary?: string };

    if (!parsed.title || !parsed.category || !parsed.summary) return null;

    const summary: IssueSummary = {
      title: parsed.title,
      category: parsed.category,
      summary: parsed.summary,
    };

    incrementQuota('gemini');
    summaryCache.set(cacheKey, { summary, cachedAt: Date.now() });
    return summary;
  } catch (err) {
    console.warn('[geminiSummarizer] failed:', (err as Error).message);
    return null;
  }
}

/** Batch summarize top issues and update DB */
export async function summarizeAndUpdateIssues(
  pool: import('pg').Pool,
  maxIssues = 20,
): Promise<number> {
  const { rows } = await pool.query<{
    id: number; cluster_ids: number[]; standalone_post_ids: number[];
  }>(
    `SELECT id, cluster_ids, standalone_post_ids
     FROM issue_rankings
     WHERE summary IS NULL
     ORDER BY issue_score DESC
     LIMIT $1`,
    [maxIssues],
  );

  if (rows.length === 0) return 0;

  let updated = 0;
  for (const row of rows) {
    // Fetch post titles for this issue
    const postIds = [...(row.standalone_post_ids ?? [])];

    // Also get posts from clusters
    if (row.cluster_ids.length > 0) {
      const clusterPosts = await pool.query<{ post_id: number }>(
        `SELECT post_id FROM post_cluster_members WHERE cluster_id = ANY($1::int[])`,
        [row.cluster_ids],
      );
      for (const cp of clusterPosts.rows) {
        postIds.push(cp.post_id);
      }
    }

    if (postIds.length === 0) continue;

    const uniqueIds = [...new Set(postIds)];
    const titleResult = await pool.query<{ title: string }>(
      `SELECT DISTINCT title FROM posts WHERE id = ANY($1::int[]) LIMIT 15`,
      [uniqueIds],
    );
    const titles = titleResult.rows.map(r => r.title);
    if (titles.length === 0) continue;

    const summary = await summarizeIssue(titles, row.cluster_ids, row.standalone_post_ids);
    if (!summary) continue;

    await pool.query(
      `UPDATE issue_rankings SET title = $1, summary = $2, category_label = $3 WHERE id = $4`,
      [summary.title, summary.summary, summary.category, row.id],
    );
    updated++;
  }

  if (updated > 0) {
    console.log(`[geminiSummarizer] updated ${updated} issue summaries`);
  }
  return updated;
}

/** Prune expired cache entries */
export function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of summaryCache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      summaryCache.delete(key);
    }
  }
}
