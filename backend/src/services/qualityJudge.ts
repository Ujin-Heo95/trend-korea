/**
 * qualityJudge — Stage 2: LLM-as-Judge 오프라인 평가.
 *
 * 매일 02:00 KST quiet hours에 전일 24h top 이슈를 Gemini Flash Lite로 평가해
 * coherence/title/summary 점수를 issue_quality_judgments에 적재한다.
 *
 * 비용 추정: 30 이슈 × ~700 토큰 × Flash Lite ⇒ 일 ~$0.04, 월 ~$1.2.
 *
 * 설계: ~/.claude/plans/reflective-twirling-horizon.md
 */
import type { Pool } from 'pg';
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Gemini Flash Lite (2025) — 입력 $0.10/M, 출력 $0.40/M (USD).
// 정확한 단가가 변하더라도 ±20% 안에서 추정값으로만 활용 (월 리포트 표시 용도).
const PRICE_INPUT_USD_PER_MTOK = 0.10;
const PRICE_OUTPUT_USD_PER_MTOK = 0.40;
const JUDGE_MODEL = 'gemini-2.5-flash-lite';

const PER_WINDOW_SAMPLE = 10;
const TARGET_WINDOWS: readonly number[] = [6, 12, 24];
const MAX_MEMBER_TITLES = 10;
const MAX_TITLE_LEN = 120;

// ─── Types ───

export interface JudgeResult {
  readonly issueId: number | null;
  readonly stableId: string | null;
  readonly coherenceScore: number | null;
  readonly titleQuality: number | null;
  readonly summaryQuality: number | null;
  readonly outlierPostIds: readonly number[];
  readonly primaryTopic: string | null;
  readonly explanation: string | null;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number;
}

interface IssueSampleRow {
  readonly id: number;
  readonly stable_id: string | null;
  readonly title: string;
  readonly summary: string | null;
  readonly window_hours: number;
  readonly cluster_ids: number[] | null;
  readonly standalone_post_ids: number[] | null;
  readonly matched_trend_keywords: string[] | null;
}

interface IssueWithMembers extends IssueSampleRow {
  readonly memberPostIds: readonly number[];
  readonly memberTitles: readonly { id: number; title: string }[];
}

// ─── Sampling ───

export async function sampleTopIssues(pool: Pool): Promise<IssueSampleRow[]> {
  const out: IssueSampleRow[] = [];
  for (const win of TARGET_WINDOWS) {
    const { rows } = await pool.query<IssueSampleRow>(
      `SELECT id, stable_id, title, summary, window_hours,
              cluster_ids, standalone_post_ids, matched_trend_keywords
         FROM issue_rankings
        WHERE expires_at > NOW()
          AND window_hours = $1
        ORDER BY issue_score DESC NULLS LAST
        LIMIT $2`,
      [win, PER_WINDOW_SAMPLE],
    );
    for (const r of rows) out.push(r);
  }
  return out;
}

async function loadMembersFor(pool: Pool, issue: IssueSampleRow): Promise<IssueWithMembers> {
  const clusterIds = issue.cluster_ids ?? [];
  const standaloneIds = issue.standalone_post_ids ?? [];
  if (clusterIds.length === 0 && standaloneIds.length === 0) {
    return { ...issue, memberPostIds: [], memberTitles: [] };
  }
  const { rows } = await pool.query<{ id: number; title: string }>(
    `SELECT DISTINCT ON (p.title) p.id, p.title
       FROM posts p
      WHERE p.id = ANY($1::int[])
         OR p.id IN (
              SELECT post_id FROM post_cluster_members WHERE cluster_id = ANY($2::int[])
            )
      ORDER BY p.title
      LIMIT $3`,
    [standaloneIds, clusterIds, MAX_MEMBER_TITLES],
  );
  return {
    ...issue,
    memberPostIds: rows.map(r => r.id),
    memberTitles: rows.map(r => ({ id: r.id, title: (r.title ?? '').slice(0, MAX_TITLE_LEN) })),
  };
}

// ─── Prompt + schema ───

const JUDGE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    coherence_score: { type: SchemaType.NUMBER },
    title_quality:   { type: SchemaType.NUMBER },
    summary_quality: { type: SchemaType.NUMBER },
    primary_topic:   { type: SchemaType.STRING },
    outliers: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER } },
    explanation:     { type: SchemaType.STRING },
  },
  required: [
    'coherence_score', 'title_quality', 'summary_quality',
    'primary_topic', 'outliers', 'explanation',
  ],
};

const JUDGE_SYSTEM_PROMPT = `당신은 한국 뉴스/커뮤니티 트렌드 클러스터의 품질을 평가하는 시니어 편집자입니다.
하나의 "이슈"는 같은 사건/주제에 대한 여러 게시글의 묶음이어야 합니다.

평가 기준:
1. coherence_score (0-10): 묶인 게시글들이 정말 같은 이슈인가?
   - 10: 모든 게시글이 동일 사건. 1: 무관한 토픽이 섞여 있음.
2. title_quality (0-10): 이슈 제목이 핵심을 정확히 압축했는가? (인물/사건/수치 보존)
3. summary_quality (0-10): 요약문이 5W1H를 충실히 담고 있는가? summary가 비어 있으면 0.
4. primary_topic: 이 이슈의 진짜 주제 한 줄 (15자 이내)
5. outliers: 이슈와 관련 없는 게시글의 id 배열. 모두 관련 있으면 빈 배열.
6. explanation: 한 문장으로 점수 사유.

⚠️ JSON 문자열 안에는 큰따옴표(")를 절대 포함하지 마세요. 인용은 ' 또는 「」를 사용하세요.
정수 id를 outliers에 그대로 넣으세요.`;

function formatPrompt(issue: IssueWithMembers): string {
  const titles = issue.memberTitles
    .map(m => `[id=${m.id}] ${m.title}`)
    .join('\n');
  const kws = (issue.matched_trend_keywords ?? []).slice(0, 8).join(', ') || '(없음)';
  return [
    JUDGE_SYSTEM_PROMPT,
    '',
    `이슈 제목: ${issue.title}`,
    `이슈 요약: ${issue.summary ?? '(없음)'}`,
    `매칭 키워드: ${kws}`,
    `윈도우: ${issue.window_hours}h`,
    '',
    '구성 게시글:',
    titles,
  ].join('\n');
}

// ─── Gemini call ───

let genAI: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI | null {
  if (!config.geminiApiKey) return null;
  if (!genAI) genAI = new GoogleGenerativeAI(config.geminiApiKey);
  return genAI;
}

interface RawJudgeJson {
  coherence_score?: number;
  title_quality?: number;
  summary_quality?: number;
  primary_topic?: string;
  outliers?: number[];
  explanation?: string;
}

function clamp(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}

export function parseJudgeResponse(text: string): RawJudgeJson | null {
  // Gemini may wrap JSON in ```json fences even with responseMimeType set.
  const cleaned = text
    .replace(/^\uFEFF/, '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const raw = JSON.parse(cleaned);
    return Array.isArray(raw) ? raw[0] : raw;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, raw: cleaned.slice(0, 300) },
      '[qualityJudge] JSON parse failed',
    );
    return null;
  }
}

function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens / 1_000_000) * PRICE_INPUT_USD_PER_MTOK +
    (completionTokens / 1_000_000) * PRICE_OUTPUT_USD_PER_MTOK
  );
}

async function judgeOne(issue: IssueWithMembers): Promise<JudgeResult | null> {
  const client = getClient();
  if (!client) return null;
  if (issue.memberTitles.length === 0) return null;

  const model = client.getGenerativeModel({ model: JUDGE_MODEL });
  const prompt = formatPrompt(issue);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const result = await model.generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 600,
          responseMimeType: 'application/json',
          responseSchema: JUDGE_SCHEMA,
        },
      },
      { signal: ctrl.signal },
    );

    const text = result.response.text();
    const parsed = parseJudgeResponse(text);
    if (!parsed) return null;

    const usage = result.response.usageMetadata;
    const promptTokens = usage?.promptTokenCount ?? 0;
    const completionTokens = usage?.candidatesTokenCount ?? 0;

    const knownIds = new Set(issue.memberPostIds);
    const outliers = (parsed.outliers ?? [])
      .map(n => Number(n))
      .filter(n => Number.isFinite(n) && knownIds.has(n));

    return {
      issueId: issue.id,
      stableId: issue.stable_id,
      coherenceScore: clamp(parsed.coherence_score),
      titleQuality:   clamp(parsed.title_quality),
      summaryQuality: clamp(parsed.summary_quality),
      outlierPostIds: outliers,
      primaryTopic: (parsed.primary_topic ?? '').slice(0, 80) || null,
      explanation:  (parsed.explanation ?? '').slice(0, 500) || null,
      promptTokens,
      completionTokens,
      costUsd: estimateCostUsd(promptTokens, completionTokens),
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message, issueId: issue.id }, '[qualityJudge] gemini call failed');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Persistence ───

async function persistJudgments(pool: Pool, results: readonly JudgeResult[]): Promise<void> {
  if (results.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of results) {
    placeholders.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
    );
    values.push(
      r.issueId, r.stableId,
      r.coherenceScore, r.titleQuality, r.summaryQuality,
      r.outlierPostIds, r.primaryTopic, r.explanation,
      JUDGE_MODEL, r.costUsd, r.promptTokens + r.completionTokens,
    );
  }
  // Note: 11 columns. We pack prompt+completion sum into prompt_tokens; completion_tokens defaults to 0
  // (we keep schema flexible for future split).
  await pool.query(
    `INSERT INTO issue_quality_judgments
       (issue_id, stable_id, coherence_score, title_quality, summary_quality,
        outlier_post_ids, primary_topic, explanation, judge_model, judge_cost_usd, prompt_tokens)
     VALUES ${placeholders.join(',')}`,
    values,
  );
}

// ─── Main batch ───

export interface JudgeBatchResult {
  readonly judged: number;
  readonly skipped: number;
  readonly failed: number;
  readonly totalCostUsd: number;
  readonly results: readonly JudgeResult[];
  readonly elapsedMs: number;
}

export async function runQualityJudgeBatch(pool: Pool): Promise<JudgeBatchResult> {
  const start = Date.now();
  if (!config.geminiApiKey) {
    logger.warn('[qualityJudge] no gemini key — skipping');
    return { judged: 0, skipped: 0, failed: 0, totalCostUsd: 0, results: [], elapsedMs: 0 };
  }

  const samples = await sampleTopIssues(pool);
  if (samples.length === 0) {
    return { judged: 0, skipped: 0, failed: 0, totalCostUsd: 0, results: [], elapsedMs: Date.now() - start };
  }

  const results: JudgeResult[] = [];
  let skipped = 0;
  let failed = 0;

  // Sequential — 30 calls × ~1s each ≤ 1분. quiet hours 한정이라 동시성 압박 없음.
  for (const sample of samples) {
    const issue = await loadMembersFor(pool, sample);
    if (issue.memberTitles.length === 0) { skipped++; continue; }
    const r = await judgeOne(issue);
    if (r) results.push(r);
    else failed++;
  }

  await persistJudgments(pool, results);

  const totalCostUsd = results.reduce((s, r) => s + r.costUsd, 0);
  const elapsedMs = Date.now() - start;
  logger.info(
    { judged: results.length, skipped, failed, totalCostUsd: totalCostUsd.toFixed(4), elapsedMs },
    '[qualityJudge] batch complete',
  );
  return { judged: results.length, skipped, failed, totalCostUsd, results, elapsedMs };
}

// ─── Daily aggregate → quality_metrics ───

export interface DailyJudgeAggregate {
  readonly count: number;
  readonly coherenceP50: number;
  readonly coherenceAvg: number;
  readonly lowCoherenceCount: number;
  readonly titleQualityAvg: number;
  readonly summaryQualityAvg: number;
  readonly outlierRatio: number;
  readonly totalCostUsd: number;
}

export function aggregateJudgments(results: readonly JudgeResult[]): DailyJudgeAggregate {
  if (results.length === 0) {
    return {
      count: 0, coherenceP50: 0, coherenceAvg: 0, lowCoherenceCount: 0,
      titleQualityAvg: 0, summaryQualityAvg: 0, outlierRatio: 0, totalCostUsd: 0,
    };
  }
  const coherences = results.map(r => r.coherenceScore ?? 0).sort((a, b) => a - b);
  const titles = results.map(r => r.titleQuality ?? 0);
  const summaries = results.map(r => r.summaryQuality ?? 0);
  const lowCoherence = results.filter(r => (r.coherenceScore ?? 10) < 6).length;
  const withOutlier = results.filter(r => r.outlierPostIds.length > 0).length;
  const avg = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
  const p50 = coherences[Math.floor(coherences.length / 2)];
  return {
    count: results.length,
    coherenceP50: p50,
    coherenceAvg: avg(coherences),
    lowCoherenceCount: lowCoherence,
    titleQualityAvg: avg(titles),
    summaryQualityAvg: avg(summaries),
    outlierRatio: withOutlier / results.length,
    totalCostUsd: results.reduce((s, r) => s + r.costUsd, 0),
  };
}

export async function persistJudgeMetrics(
  pool: Pool,
  agg: DailyJudgeAggregate,
): Promise<void> {
  if (agg.count === 0) return;
  const metrics = [
    { name: 'judge.count', value: agg.count },
    { name: 'judge.coherence_p50', value: agg.coherenceP50 },
    { name: 'judge.coherence_avg', value: agg.coherenceAvg },
    { name: 'judge.low_coherence_count', value: agg.lowCoherenceCount },
    { name: 'judge.title_quality_avg', value: agg.titleQualityAvg },
    { name: 'judge.summary_quality_avg', value: agg.summaryQualityAvg },
    { name: 'judge.outlier_ratio', value: agg.outlierRatio },
    { name: 'judge.cost_usd', value: agg.totalCostUsd },
  ];
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const m of metrics) {
    placeholders.push(`($${i++}, $${i++})`);
    values.push(m.name, Number.isFinite(m.value) ? m.value : 0);
  }
  await pool.query(
    `INSERT INTO quality_metrics (metric_name, value) VALUES ${placeholders.join(',')}`,
    values,
  );
}

// ─── Daily report (Discord) ───

export interface JudgeReport {
  readonly batchResult: JudgeBatchResult;
  readonly aggregate: DailyJudgeAggregate;
}

export function formatJudgeReport(rep: JudgeReport): string {
  const a = rep.aggregate;
  if (a.count === 0) return '품질 리포트: 평가 대상 없음';
  const lows = rep.batchResult.results
    .filter(r => (r.coherenceScore ?? 10) < 6)
    .slice(0, 5)
    .map(r => `#${r.issueId ?? '?'}${r.stableId ? ` (${r.stableId.slice(0, 8)})` : ''}`)
    .join(' ');
  const lines = [
    `[품질 리포트] avg coherence ${a.coherenceAvg.toFixed(2)}/10`,
    `low(<6) ${a.lowCoherenceCount}건 · outlier ${(a.outlierRatio * 100).toFixed(0)}%`,
    `평가 ${a.count}건 · 비용 $${a.totalCostUsd.toFixed(4)}`,
  ];
  if (lows) lines.push(`⚠ low coherence: ${lows}`);
  return lines.join('\n');
}
