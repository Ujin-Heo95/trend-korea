import { GoogleGenerativeAI } from '@google/generative-ai';
import pLimit from 'p-limit';
import { config } from '../config/index.js';
import { checkQuota, incrementQuota } from './apiQuota.js';
import { getChannel } from './scoring-weights.js';

const GEMINI_DAILY_QUOTA = parseInt(process.env.GEMINI_DAILY_QUOTA ?? '1500', 10);

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
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

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

// ─── Fallback Category ───

const FALLBACK_CATEGORY_PATTERNS: readonly [RegExp, string][] = [
  [/주식|코스피|코스닥|환율|금리|부동산|경제|투자|증시/, '경제'],
  [/대통령|국회|여당|야당|정치|선거|탄핵|의원/, '정치'],
  [/AI|반도체|로봇|우주|IT|테크|앱|소프트웨어/, 'IT과학'],
  [/아이돌|드라마|영화|배우|가수|연예|방송/, '연예'],
  [/축구|야구|농구|올림픽|스포츠|경기|선수/, '스포츠'],
  [/미국|중국|일본|유럽|전쟁|외교|세계/, '세계'],
  [/생활|날씨|건강|교통|맛집|여행|육아|교육|의료/, '생활'],
];

function fallbackCategory(title: string): string {
  for (const [pattern, label] of FALLBACK_CATEGORY_PATTERNS) {
    if (pattern.test(title)) return label;
  }
  return '사회';
}

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

  if (!checkQuota('gemini', GEMINI_DAILY_QUOTA)) return null;
  incrementQuota('gemini');

  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  const postsText = formatPostsForPrompt(posts);

  // Retry 1회 (2초 backoff)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
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
      console.warn(`[geminiSummarizer] attempt ${attempt + 1} failed:`, (err as Error).message);
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return null;
}

/** Batch summarize top issues and update DB */
export async function summarizeAndUpdateIssues(
  pool: import('pg').Pool,
  maxIssues = 30,
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

  async function processOneRow(row: typeof rows[number]): Promise<void> {
    // Try reuse: prefer stable_id as cache key, fall back to legacy key
    const stableCacheKey = row.stable_id ?? undefined;
    const legacyCacheKey = makeCacheKey(row.cluster_ids, row.standalone_post_ids);
    const cacheKey = stableCacheKey ?? legacyCacheKey;

    const prev = summaryCache.get(cacheKey)
      ?? (stableCacheKey ? summaryCache.get(legacyCacheKey) : undefined);
    if (prev && Date.now() - prev.cachedAt < CACHE_TTL_MS) {
      await pool.query(
        `UPDATE issue_rankings SET title = $1, summary = $2, category_label = $3 WHERE id = $4`,
        [prev.summary.title, prev.summary.summary, prev.summary.category, row.id],
      );
      updated++;
      return;
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

    if (postIds.length === 0) return;

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

    if (posts.length === 0) return;

    let summary = await summarizeIssue(posts, row.cluster_ids, row.standalone_post_ids);

    // Fallback: generate minimal summary when Gemini fails
    if (!summary) {
      const firstTitle = posts[0].title;
      summary = {
        title: firstTitle.length > 25 ? firstTitle.slice(0, 25) : firstTitle,
        category: fallbackCategory(firstTitle),
        summary: `관련 기사 ${posts.length}건`,
      };
    }

    await pool.query(
      `UPDATE issue_rankings SET title = $1, summary = $2, category_label = $3 WHERE id = $4`,
      [summary.title, summary.summary, summary.category, row.id],
    );

    // Cache with stable_id key (and legacy key for backward compat)
    const entry = { summary, cachedAt: Date.now() };
    summaryCache.set(cacheKey, entry);
    if (stableCacheKey && stableCacheKey !== legacyCacheKey) {
      summaryCache.set(legacyCacheKey, entry);
    }

    updated++;
  }

  const limit = pLimit(3);
  await Promise.all(rows.map(row => limit(() => processOneRow(row))));

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
