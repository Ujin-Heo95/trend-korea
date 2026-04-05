import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import { checkQuota, incrementQuota } from './apiQuota.js';
import { getChannel } from './scoring-weights.js';

// ─── Types ───

export interface IssueSummary {
  readonly title: string;
  readonly category: string;
  readonly summary: string;
}

interface PostForSummary {
  readonly title: string;
  readonly contentSnippet: string | null;
  readonly category: string | null;
  readonly sourceKey: string;
}

// ─── Cache ───

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

const SYSTEM_PROMPT = `당신은 한국 뉴스/커뮤니티/영상 트렌드를 분석하는 수석 편집자입니다.
주어진 게시글 제목과 본문 요약을 분석해서 이 이슈의 핵심을 정리하세요.
제목을 우선적으로 참고하고, 본문 요약은 맥락 보충에 활용하세요.

규칙:
1. title: 여러 게시글 제목의 공통 핵심을 추출·압축한 구어체 제목 (25자 이내). 제목들의 핵심 키워드·인물·사건을 하나의 짧은 문구로 합침. 이모지 1-2개 포함.
   예시: "메타, 인스타 유료 구독 시범 운영 🤳💸"
2. category: 사회/경제/정치/IT과학/연예/스포츠/생활/세계 중 1개
3. summary: 3-4문장으로 육하원칙(누가/언제/어디서/무엇을/어떻게/왜) 요소를 빠짐없이 포함.
   - 엄격히 ~요체 구어체 존댓말만 사용 (~요, ~인데요, ~라고, ~거래요, ~이에요)
   - ~다 체 절대 금지 (~합니다, ~했다, ~이다 등 모두 금지)
   - 구체적 수치/인명/기관명 포함
   - 반드시 제공된 내용만 근거로 작성. 추측·의견·분석 금지.
   예시: "메타가 인스타그램 유료 구독 서비스를 시범 운영하고 있어요. 다른 사람의 스토리를 몰래 볼 수 있는 기능에 이목이 쏠리고 있는데요. 구독료는 월 1~2달러 수준이라고."

JSON만 출력: {"title": "...", "category": "...", "summary": "..."}`;

// ─── Channel Label ───

function channelLabel(category: string | null): string {
  const ch = getChannel(category);
  if (ch === 'news') return '뉴스';
  if (ch === 'video') return '영상';
  if (ch === 'community') return '커뮤니티';
  return '기타';
}

// ─── Format Input ───

function formatPostsForPrompt(posts: readonly PostForSummary[]): string {
  return posts.slice(0, 15).map((p, i) => {
    const label = channelLabel(p.category);
    const snippet = p.contentSnippet
      ? `\n   > ${p.contentSnippet.slice(0, 200)}`
      : '';
    return `${i + 1}. [${label}] ${p.title}${snippet}`;
  }).join('\n');
}

// ─── Public API ───

export async function summarizeIssue(
  posts: readonly PostForSummary[],
  clusterIds: readonly number[],
  standalonePostIds: readonly number[],
): Promise<IssueSummary | null> {
  const cacheKey = makeCacheKey(clusterIds, standalonePostIds);
  const cached = summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.summary;
  }

  const client = getClient();
  if (!client) return null;

  if (!checkQuota('gemini', 500)) return null;
  incrementQuota('gemini');

  try {
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const postsText = formatPostsForPrompt(posts);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n게시글:\n${postsText}` }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500,
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
  // Fetch unsummarized issues + check for stale summaries (cluster composition changed)
  const { rows } = await pool.query<{
    id: number; cluster_ids: number[]; standalone_post_ids: number[];
    summary: string | null; stable_id: string | null;
  }>(
    `SELECT id, cluster_ids, standalone_post_ids, summary, stable_id
     FROM issue_rankings
     WHERE summary IS NULL
     ORDER BY issue_score DESC
     LIMIT $1`,
    [maxIssues],
  );

  if (rows.length === 0) return 0;

  let updated = 0;
  for (const row of rows) {
    // Try reuse: check if a previous issue with same stable_id had a summary
    if (row.stable_id) {
      const prev = summaryCache.get(makeCacheKey(row.cluster_ids, row.standalone_post_ids));
      if (prev && Date.now() - prev.cachedAt < CACHE_TTL_MS) {
        await pool.query(
          `UPDATE issue_rankings SET title = $1, summary = $2, category_label = $3 WHERE id = $4`,
          [prev.summary.title, prev.summary.summary, prev.summary.category, row.id],
        );
        updated++;
        continue;
      }
    }

    // Collect post IDs
    const postIds = [...(row.standalone_post_ids ?? [])];
    if (row.cluster_ids.length > 0) {
      const clusterPosts = await pool.query<{ post_id: number }>(
        `SELECT post_id FROM post_cluster_members WHERE cluster_id = ANY($1::int[])`,
        [row.cluster_ids],
      );
      for (const cp of clusterPosts.rows) postIds.push(cp.post_id);
    }

    if (postIds.length === 0) continue;

    const uniqueIds = [...new Set(postIds)];
    // Fetch titles + content_snippet + category + source_key
    const postResult = await pool.query<{
      title: string; content_snippet: string | null; category: string | null; source_key: string;
    }>(
      `SELECT DISTINCT ON (title) title, content_snippet, category, source_key
       FROM posts WHERE id = ANY($1::int[])
       ORDER BY title, COALESCE(content_snippet, '') DESC
       LIMIT 15`,
      [uniqueIds],
    );

    const posts: PostForSummary[] = postResult.rows.map(r => ({
      title: r.title,
      contentSnippet: r.content_snippet,
      category: r.category,
      sourceKey: r.source_key,
    }));

    if (posts.length === 0) continue;

    const summary = await summarizeIssue(posts, row.cluster_ids, row.standalone_post_ids);
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
