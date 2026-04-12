import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai';
import pLimit from 'p-limit';
import { config } from '../config/index.js';
import { checkQuota, incrementQuota } from './apiQuota.js';
import { getChannel } from './scoring-weights.js';
import {
  computeFingerprint,
  topPostIdsFor,
  getCachedSummary,
  setCachedSummary,
} from './issueSummaryCache.js';
import {
  buildQueue,
  loadQueueConfig,
  recordSnapshot,
  DEFAULT_QUEUE_CONFIG,
  type QueueConfig,
  type QueueBuildRow,
} from './summaryQueue.js';

const GEMINI_DAILY_QUOTA = parseInt(process.env.GEMINI_DAILY_QUOTA ?? '1500', 10);

// ─── Types ───

export interface IssueSummary {
  readonly title: string;
  readonly category: string;
  readonly summary: string;
  readonly qualityScore: number | null;
  readonly keywords: readonly string[];
  readonly sentiment: string | null;
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
const MAX_SUMMARY_CACHE = 200;

function evictOldestIfFull(): void {
  if (summaryCache.size < MAX_SUMMARY_CACHE) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of summaryCache) {
    if (entry.cachedAt < oldestTime) { oldestKey = key; oldestTime = entry.cachedAt; }
  }
  if (oldestKey) summaryCache.delete(oldestKey);
}

function makeCacheKey(clusterIds: readonly number[], standalonePostIds: readonly number[]): string {
  return [...clusterIds].sort().join(',') + '|' + [...standalonePostIds].sort().join(',');
}

// ─── Response Schema (TD-006 C) ───
// Strict structured output — Gemini rejects fields outside this schema.
const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title:         { type: SchemaType.STRING },
    category:      { type: SchemaType.STRING },
    summary:       { type: SchemaType.STRING },
    quality_score: { type: SchemaType.INTEGER },
    keywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    sentiment: { type: SchemaType.STRING },
  },
  required: ['title', 'category', 'summary', 'quality_score', 'keywords', 'sentiment'],
};

// ─── Metrics (TD-006 E) ───
// Reset at the start of every summarizeAndUpdateIssues call.
interface SummaryMetrics {
  calls: number;
  timeouts: number;
  cacheHits: number;   // mem + DB fingerprint cache
  fallbacks: number;
  totalLatencyMs: number;
}

const metrics: SummaryMetrics = {
  calls: 0, timeouts: 0, cacheHits: 0, fallbacks: 0, totalLatencyMs: 0,
};

export function getSummaryMetrics(): Readonly<SummaryMetrics> & { avgLatencyMs: number; hitRate: number; fallbackRate: number } {
  const processed = metrics.calls + metrics.cacheHits + metrics.fallbacks;
  return {
    ...metrics,
    avgLatencyMs: metrics.calls > 0 ? metrics.totalLatencyMs / metrics.calls : 0,
    hitRate: processed > 0 ? metrics.cacheHits / processed : 0,
    fallbackRate: processed > 0 ? metrics.fallbacks / processed : 0,
  };
}

function resetMetrics(): void {
  metrics.calls = 0;
  metrics.timeouts = 0;
  metrics.cacheHits = 0;
  metrics.fallbacks = 0;
  metrics.totalLatencyMs = 0;
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
1. title: 원문 제목들의 핵심 정보를 누락 없이 축약한 제목 (30자 이내). ~요체 사용 금지 — 명사형·개조식으로 끝내세요.
   - 원문에 있는 인물명·기관명·수치·키워드를 최대한 보존하되 중복·불필요한 수식을 제거해 압축.
   - 일반 주제: 제목 끝에 반드시 이모지 1-2개를 붙이세요. 이모지가 없으면 실패입니다.
     ✅ "삼성전자, 1분기 영업이익 6조 원 돌파 📈💰"
     ✅ "BTS 진, 솔로 월드투어 개최 확정 🎤🌍"
     ✅ "서울 벚꽃 축제 이번 주말 절정 🌸"
     ✅ "테슬라 자율주행 택시, 6월 미국 출시 🚗🤖"
     ❌ "삼성전자, 1분기 영업이익 6조 원 돌파" ← 이모지 없음 = 실패
   - ⚠️ 민감 주제 (사망·재난·사고·범죄·테러·전쟁·학대): 이모지 절대 금지.
2. category: 사회/경제/정치/IT과학/연예/스포츠/생활/세계 중 1개
3. summary: 5-7문장으로 육하원칙(누가/언제/어디서/무엇을/어떻게/왜) 요소를 빠짐없이 포함.
   - 모든 문장을 반드시 짧고 간결한 ~요체로 끝내세요: ~어요, ~했어요, ~이에요, ~예요
   - ✅ 허용 어미: ~어요, ~했어요, ~이에요, ~예요, ~있어요, ~됐어요, ~봐요
   - ❌ 금지 어미(장황): ~라고해요, ~다고해요, ~한다고해요, ~라고하네요, ~다고하는데요
   - ❌ 금지 어미(감탄·추임새): ~네요, ~죠, ~거든요, ~인데요, ~잖아요
   - ❌ 금지 어미(격식): ~다, ~했다, ~이다, ~합니다, ~됩니다, ~입니다, ~한다, ~된다, ~라고 한다
   - ❌→✅ 변환 예시: "발표했다고해요"→"발표했어요", "예정이라고하네요"→"예정이에요", "치열해지고 있죠"→"치열해지고 있어요"
   - 구체적 수치/인명/기관명 포함. 추측·의견·분석 금지.
   예시: "메타가 인스타그램 유료 구독을 시범 운영해요. 다른 사람의 스토리를 몰래 볼 수 있는 기능이 화제예요. 구독료는 월 1~2달러 수준이에요. 미국과 유럽에서 먼저 시작했고, 한국 도입도 거론되고 있어요. SNS 유료 모델 경쟁이 치열해지고 있어요."
4. quality_score: 뉴스 가치 평가 (1-10 정수). 사회적 파급력, 시의성, 공익성, 영향 범위를 종합 판단.
   - 10: 국가적 사건 (대형 재난, 정권 교체)
   - 7-9: 주요 이슈 (정책 변경, 대형 사건사고)
   - 4-6: 일반 이슈 (연예, 스포츠 결과, 기업 뉴스)
   - 1-3: 가벼운 화제 (바이럴, 밈, 가십)
5. keywords: 이 이슈의 핵심 검색 키워드 3-5개 (한국어, 명사 위주). SEO·검색용.
6. sentiment: 이슈의 전반적 감성. "positive", "negative", "neutral" 중 1개.

JSON만 출력: {"title": "...", "category": "...", "summary": "...", "quality_score": 7, "keywords": ["키워드1", "키워드2"], "sentiment": "neutral"}

⚠️ 최종 확인: summary의 모든 문장이 ~어요/~이에요/~예요 어미로만 끝나야 합니다. ~네요/~죠/~거든요/~인데요/~잖아요/~다/~니다/~라고해요/~다고해요 중 하나라도 있으면 실패입니다.`;

// ─── Emoji Fallback ───

const CATEGORY_FALLBACK_EMOJI: Readonly<Record<string, string>> = {
  '경제': '💰', '정치': '🏛️', 'IT과학': '💻', '연예': '🎬',
  '스포츠': '🏆', '세계': '🌍', '생활': '🏠', '사회': '📢',
};

function ensureEmoji(
  title: string, category: string,
  qualityScore: number | null, sentiment: string | null,
): string {
  if ((qualityScore ?? 0) >= 8 && sentiment === 'negative') return title;
  if (/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(title)) return title;
  return `${title} ${CATEGORY_FALLBACK_EMOJI[category] ?? '📌'}`;
}

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

// ─── Shared Parsing ───

type RawParsed = {
  title?: string; category?: string; summary?: string;
  quality_score?: number; keywords?: string[]; sentiment?: string;
};

const VALID_SENTIMENTS = new Set(['positive', 'negative', 'neutral']);

function validateAndBuild(parsed: RawParsed): IssueSummary | null {
  if (!parsed.title || !parsed.category || !parsed.summary) return null;

  const qualityScore = typeof parsed.quality_score === 'number'
    ? Math.max(1, Math.min(10, Math.round(parsed.quality_score))) : null;
  const sentimentVal = VALID_SENTIMENTS.has(parsed.sentiment ?? '') ? parsed.sentiment! : null;

  // Ensure emoji (fallback if missing), then strip for sensitive topics
  const withEmoji = ensureEmoji(parsed.title, parsed.category, qualityScore, sentimentVal);
  const cleanTitle = (qualityScore ?? 0) >= 8 && sentimentVal === 'negative'
    ? withEmoji.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim()
    : withEmoji;

  // ~다체 drift detection for monitoring
  if (/[^요죠네래][다니][.\s"}\,]/.test(parsed.summary)) {
    console.warn(`[geminiSummarizer] ~다체 drift detected in summary`);
  }

  return {
    title: cleanTitle,
    category: parsed.category,
    summary: parsed.summary,
    qualityScore,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [],
    sentiment: sentimentVal,
  };
}

// ─── Single Issue Summarize ───

async function summarizeSingleIssue(
  posts: readonly PostForSummary[],
  opts: { signal?: AbortSignal; singleCallTimeoutMs: number } = { singleCallTimeoutMs: 8_000 },
): Promise<IssueSummary | null> {
  const client = getClient();
  if (!client) return null;

  if (!checkQuota('gemini', GEMINI_DAILY_QUOTA)) {
    console.warn('[geminiSummarizer] quota exhausted — skipping');
    return null;
  }
  incrementQuota('gemini');

  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const postsText = formatPostsForPrompt(posts);

  // Phase signal propagates — abort the whole call chain when the 90s budget expires.
  // Single-call timer gives us a per-request cap so one slow call can't monopolize.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (opts.signal?.aborted) return null;

    const perCall = new AbortController();
    const onPhaseAbort = (): void => perCall.abort();
    opts.signal?.addEventListener('abort', onPhaseAbort, { once: true });
    const timer = setTimeout(() => perCall.abort(), opts.singleCallTimeoutMs);
    const startedAt = Date.now();

    try {
      const result = await model.generateContent(
        {
          contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n게시글:\n${postsText}` }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1200,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        },
        { signal: perCall.signal },
      );

      metrics.calls++;
      metrics.totalLatencyMs += Date.now() - startedAt;

      const text = result.response.text();
      const raw = JSON.parse(text);
      const parsed = (Array.isArray(raw) ? raw[0] : raw) as RawParsed;
      const summary = validateAndBuild(parsed);

      if (!summary) {
        console.warn(`[geminiSummarizer] validation failed — raw keys: ${parsed ? Object.keys(parsed).join(',') : 'null'}`);
        return null;
      }
      return summary;
    } catch (err) {
      const aborted = perCall.signal.aborted;
      if (aborted) metrics.timeouts++;
      console.warn(`[geminiSummarizer] attempt ${attempt + 1} failed${aborted ? ' (aborted)' : ''}:`, (err as Error).message);
      // If the phase budget expired, give up immediately — no retry.
      if (opts.signal?.aborted) return null;
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onPhaseAbort);
    }
  }
  return null;
}

// ─── Row-level helpers ───

interface IssueRow {
  readonly id: number;
  readonly cluster_ids: number[];
  readonly standalone_post_ids: number[];
  readonly summary: string | null;
  readonly stable_id: string | null;
}

function cacheKeysForRow(row: IssueRow): { stableKey: string | undefined; legacyKey: string; primaryKey: string } {
  const stableKey = row.stable_id ?? undefined;
  const legacyKey = makeCacheKey(row.cluster_ids, row.standalone_post_ids);
  return { stableKey, legacyKey, primaryKey: stableKey ?? legacyKey };
}

interface FetchedPosts {
  readonly posts: readonly PostForSummary[];
  readonly allPostIds: readonly number[];
}

async function fetchPostsForRow(pool: import('pg').Pool, row: IssueRow): Promise<FetchedPosts> {
  const postIds = [...(row.standalone_post_ids ?? [])];
  if (row.cluster_ids.length > 0) {
    const clusterPosts = await pool.query<{ post_id: number }>(
      `SELECT post_id FROM post_cluster_members WHERE cluster_id = ANY($1::int[])`,
      [row.cluster_ids],
    );
    for (const cp of clusterPosts.rows) postIds.push(cp.post_id);
  }
  if (postIds.length === 0) return { posts: [], allPostIds: [] };

  const uniqueIds = [...new Set(postIds)];
  const postResult = await pool.query<{
    title: string; content_snippet: string | null; category: string | null; source_key: string;
  }>(
    `SELECT DISTINCT ON (title) title, content_snippet, category, source_key
     FROM posts WHERE id = ANY($1::int[])
     ORDER BY title, COALESCE(content_snippet, '') DESC
     LIMIT 15`,
    [uniqueIds],
  );

  return {
    posts: postResult.rows.map(r => ({
      title: r.title,
      contentSnippet: r.content_snippet,
      category: r.category,
      sourceKey: r.source_key,
    })),
    allPostIds: uniqueIds,
  };
}

async function updateIssueInDb(
  pool: import('pg').Pool, rowId: number, summary: IssueSummary,
): Promise<void> {
  await pool.query(
    `UPDATE issue_rankings SET title = $1, summary = $2, category_label = $3,
            quality_score = $5, ai_keywords = $6, sentiment = $7
     WHERE id = $4`,
    [summary.title, summary.summary, summary.category, rowId,
     summary.qualityScore, summary.keywords, summary.sentiment],
  );
}

function cacheSummary(row: IssueRow, summary: IssueSummary): void {
  const { stableKey, legacyKey, primaryKey } = cacheKeysForRow(row);
  const entry = { summary, cachedAt: Date.now() };
  evictOldestIfFull();
  summaryCache.set(primaryKey, entry);
  if (stableKey && stableKey !== legacyKey) {
    evictOldestIfFull();
    summaryCache.set(legacyKey, entry);
  }
}

function makeFallbackSummary(posts: readonly PostForSummary[], rowId: number): IssueSummary {
  const firstTitle = posts[0].title;
  console.warn(`[geminiSummarizer] fallback used for issue ${rowId} — Gemini unavailable`);
  return {
    title: firstTitle.length > 25 ? firstTitle.slice(0, 25) : firstTitle,
    category: fallbackCategory(firstTitle),
    summary: `[fallback] 관련 기사 ${posts.length}건`,
    qualityScore: null,
    keywords: [],
    sentiment: null,
  };
}

// ─── Pipeline ───

interface PriorityRow extends IssueRow {
  readonly issue_score: number;
  readonly calculated_at: Date;
}

function toBuildRow(row: PriorityRow, topPostIds: readonly number[]): QueueBuildRow {
  return {
    rowId: row.id,
    stableId: row.stable_id,
    issueScore: row.issue_score,
    calculatedAt: row.calculated_at,
    summary: row.summary,
    topPostIds,
  };
}

/** Summarize top issues individually and update DB.
 *  윈도우별로 공평하게 slot 할당하여 6h/24h가 starvation 되지 않도록 함.
 *
 *  TD-006 Round 5:
 *  - summaryQueue priority 정렬로 대체 (기존 PARTITION BY rn 유지하되 사후 재정렬)
 *  - 90s phase budget + 8s per-call AbortController
 *  - budget 소진 시 남은 이슈는 즉시 fallback_template으로 채워 반환
 */
export async function summarizeAndUpdateIssues(
  pool: import('pg').Pool,
  maxIssuesPerWindow?: number,
): Promise<number> {
  resetMetrics();
  pruneCache();

  // Load tunables (config-driven via scoring_config.summary_queue)
  const cfg: QueueConfig = await loadQueueConfig(pool).catch(() => DEFAULT_QUEUE_CONFIG);
  const perWindow = maxIssuesPerWindow ?? cfg.maxIssuesPerWindow;

  // Pull all top-N per window regardless of summary state — the queue priority
  // decides who actually gets re-summarized. Fresh non-stale rows with no
  // member change produce priority × small-factor and self-select out below.
  const { rows } = await pool.query<PriorityRow>(
    `SELECT id, cluster_ids, standalone_post_ids, summary, stable_id, issue_score, calculated_at FROM (
       SELECT id, cluster_ids, standalone_post_ids, summary, stable_id, issue_score, calculated_at,
              ROW_NUMBER() OVER (PARTITION BY window_hours ORDER BY issue_score DESC) AS rn
         FROM issue_rankings
        WHERE expires_at > NOW()
     ) t
     WHERE t.rn <= $1`,
    [perWindow],
  );

  if (rows.length === 0) return 0;

  // Phase-wide AbortController: 90s hard budget. On expiry, remaining queue
  // items get fallback-template summaries and the phase returns cleanly.
  const phase = new AbortController();
  const phaseTimer = setTimeout(() => phase.abort(), cfg.phaseTimeoutMs);

  let updated = 0;
  const inflightByFingerprint = new Map<string, Promise<IssueSummary>>();
  const geminiLimit = pLimit(3);
  const fetchLimit = pLimit(4);

  try {
    // ── Step 1: fetch posts (needed for topPostIds → fingerprint → priority) ──
    const withPosts = await Promise.all(
      rows.map(row => fetchLimit(async () => ({
        row,
        ...(await fetchPostsForRow(pool, row)),
      }))),
    );
    const validItems = withPosts.filter(it => it.posts.length > 0);
    if (validItems.length === 0) return 0;

    // ── Step 2: priority queue build (stale + novelty-boosted first) ──
    const buildRows: QueueBuildRow[] = validItems.map(it =>
      toBuildRow(it.row, topPostIdsFor(it.allPostIds)),
    );
    const queue = buildQueue(buildRows, cfg);
    const itemByRowId = new Map(validItems.map(it => [it.row.id, it]));

    // ── Step 3: process in priority order. Skip rows that are fresh, non-stale,
    //          and have no novelty signal — they're already up to date. ──
    const processOne = async (rowId: number): Promise<void> => {
      const item = itemByRowId.get(rowId);
      if (!item) return;
      const { row, posts, allPostIds } = item;

      // Always record snapshot so next tick can detect novelty
      const top = topPostIdsFor(allPostIds);
      recordSnapshot(row.stable_id, top);

      // Phase aborted → fallback without calling Gemini
      if (phase.signal.aborted) {
        if (!row.summary || row.summary.startsWith('[fallback]')) {
          const fb = makeFallbackSummary(posts, row.id);
          await updateIssueInDb(pool, row.id, fb);
          metrics.fallbacks++;
          updated++;
        }
        return;
      }

      const fingerprint = computeFingerprint(allPostIds);

      // In-memory cache hit
      const { stableKey, legacyKey, primaryKey } = cacheKeysForRow(row);
      const prev = summaryCache.get(primaryKey) ?? (stableKey ? summaryCache.get(legacyKey) : undefined);
      if (prev && Date.now() - prev.cachedAt < CACHE_TTL_MS) {
        await updateIssueInDb(pool, row.id, prev.summary);
        metrics.cacheHits++;
        updated++;
        return;
      }

      // DB fingerprint cache hit
      const dbHit = await getCachedSummary(pool, fingerprint, top);
      if (dbHit) {
        await updateIssueInDb(pool, row.id, dbHit.summary);
        cacheSummary(row, dbHit.summary);
        metrics.cacheHits++;
        updated++;
        return;
      }

      // In-batch dedup (same fingerprint resolved concurrently)
      const inflight = inflightByFingerprint.get(fingerprint);
      if (inflight) {
        const summary = await inflight;
        await updateIssueInDb(pool, row.id, summary);
        cacheSummary(row, summary);
        metrics.cacheHits++;
        updated++;
        return;
      }

      // Dispatch Gemini call (rate-limited, phase-signal aware)
      const promise = geminiLimit(async () => {
        const result = await summarizeSingleIssue(posts, {
          signal: phase.signal,
          singleCallTimeoutMs: cfg.singleCallTimeoutMs,
        });
        if (result) return result;
        metrics.fallbacks++;
        return makeFallbackSummary(posts, row.id);
      });
      inflightByFingerprint.set(fingerprint, promise);

      const summary = await promise;
      await updateIssueInDb(pool, row.id, summary);
      cacheSummary(row, summary);

      // Persist to DB fingerprint cache (skip fallbacks — they're degraded)
      if (!summary.summary.startsWith('[fallback]')) {
        try {
          await setCachedSummary(pool, fingerprint, summary, top);
        } catch (err) {
          console.warn('[geminiSummarizer] DB cache write failed:', (err as Error).message);
        }
      }
      updated++;
    };

    // Partition queue: targets (need work) vs skips (already fresh + unchanged).
    // A row "needs work" if stale OR novelty boost triggered.
    const targets = queue.filter(q =>
      q.summaryIsStale || q.memberChangeRate >= cfg.noveltyThreshold,
    );

    // Still record snapshots for skipped rows so next tick's novelty detection works
    for (const q of queue) {
      if (targets.includes(q)) continue;
      const item = itemByRowId.get(q.rowId);
      if (item) recordSnapshot(item.row.stable_id, topPostIdsFor(item.allPostIds));
    }

    // Process targets sequentially in priority order (geminiLimit caps actual parallelism)
    for (const q of targets) {
      if (phase.signal.aborted) {
        // Phase budget exhausted — fallback-fill remaining stale rows
        const item = itemByRowId.get(q.rowId);
        if (item && q.summaryIsStale) {
          const fb = makeFallbackSummary(item.posts, item.row.id);
          await updateIssueInDb(pool, item.row.id, fb);
          metrics.fallbacks++;
          updated++;
        }
        continue;
      }
      await processOne(q.rowId);
    }

    const m = getSummaryMetrics();
    console.log(
      `[geminiSummarizer] updated ${updated}/${queue.length} ` +
      `(targets=${targets.length}, calls=${m.calls}, timeouts=${m.timeouts}, ` +
      `cache=${m.cacheHits}, fallback=${m.fallbacks}, avg=${m.avgLatencyMs.toFixed(0)}ms)`,
    );
    return updated;
  } finally {
    clearTimeout(phaseTimer);
  }
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
