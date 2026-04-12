/**
 * mergeArbiter — borderline 이슈 병합 후보를 Gemini에 위임해 "같은 사건?" 판정.
 *
 * 호출 조건 (issueAggregator 측에서 결정):
 *   - 양쪽 entity Set이 모두 비어있어 hard-filter로 결정 불가
 *   - AND 임베딩 cos이 borderline 구간 (0.80~0.88)
 *
 * 비용 가드:
 *   - 한 배치당 호출 상한 (DEFAULT_MAX_CALLS_PER_BATCH)
 *   - in-memory LRU 캐시 (제목 페어 → bool, TTL 1h)
 *   - 모델 호출 실패/타임아웃 시 보수적 거부 (false)
 *
 * 모델: gemini-2.5-flash-lite (project_gemini_model_choice 메모리 준수)
 */
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai';
import { createHash } from 'crypto';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_MAX_CALLS_PER_BATCH = 50;
const CACHE_MAX_SIZE = 500;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const TIMEOUT_MS = 8_000;

interface CacheEntry {
  readonly value: boolean;
  readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
let callsThisBatch = 0;
let maxCallsPerBatch = DEFAULT_MAX_CALLS_PER_BATCH;

let genAI: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI | null {
  if (!config.geminiApiKey) return null;
  if (!genAI) genAI = new GoogleGenerativeAI(config.geminiApiKey);
  return genAI;
}

function pairKey(a: string, b: string): string {
  const [first, second] = a < b ? [a, b] : [b, a];
  return createHash('md5').update(`${first}\u0000${second}`).digest('hex');
}

function cacheGet(key: string): boolean | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // LRU touch
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: boolean): void {
  if (cache.size >= CACHE_MAX_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

const SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    same_event: { type: SchemaType.BOOLEAN },
  },
  required: ['same_event'],
};

const SYSTEM_PROMPT = `당신은 한국 뉴스 편집자입니다. 두 뉴스 제목이 **정확히 같은 구체적 사건/이벤트**를 다루는지 판정합니다.

규칙:
- 같은 인물·팀·조직·사건이 명시적으로 일치하면 true
- 단순히 같은 토픽(예: 둘 다 축구, 둘 다 경제)만으로는 false
- 한쪽이 추상/논평이고 다른 쪽이 구체적 사건이면 false
- 확신이 없으면 false (보수적 판정)

JSON으로만 답하세요: {"same_event": true|false}`;

interface ArbiterResult {
  readonly sameEvent: boolean;
  readonly fromCache: boolean;
  readonly skipped: 'no_key' | 'budget' | null;
}

/**
 * 두 제목이 같은 사건인지 Gemini에 질의.
 * 캐시 hit/예산 초과/오류 시 보수적 false 반환.
 */
export async function arbitrateMerge(titleA: string, titleB: string): Promise<ArbiterResult> {
  const key = pairKey(titleA, titleB);
  const cached = cacheGet(key);
  if (cached !== null) {
    return { sameEvent: cached, fromCache: true, skipped: null };
  }

  const client = getClient();
  if (!client) {
    return { sameEvent: false, fromCache: false, skipped: 'no_key' };
  }
  if (callsThisBatch >= maxCallsPerBatch) {
    return { sameEvent: false, fromCache: false, skipped: 'budget' };
  }

  callsThisBatch++;
  const model = client.getGenerativeModel({ model: MODEL });
  const prompt = `${SYSTEM_PROMPT}\n\n제목 A: ${titleA}\n제목 B: ${titleB}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const result = await model.generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 30,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
        },
      },
      { signal: ctrl.signal },
    );
    const text = result.response.text();
    const parsed = JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, ''));
    const same = Boolean(parsed?.same_event);
    cacheSet(key, same);
    return { sameEvent: same, fromCache: false, skipped: null };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, titleA: titleA.slice(0, 60), titleB: titleB.slice(0, 60) },
      '[mergeArbiter] gemini call failed — defaulting to no-merge',
    );
    return { sameEvent: false, fromCache: false, skipped: null };
  } finally {
    clearTimeout(timer);
  }
}

/** issueAggregator 배치 시작 시 호출 — 호출 카운터 리셋 */
export function resetArbiterBatchState(maxCalls: number = DEFAULT_MAX_CALLS_PER_BATCH): void {
  callsThisBatch = 0;
  maxCallsPerBatch = maxCalls;
}

export function getArbiterStats(): { calls: number; maxCalls: number; cacheSize: number } {
  return { calls: callsThisBatch, maxCalls: maxCallsPerBatch, cacheSize: cache.size };
}

export const __internal__ = {
  pairKey,
  cache,
  cacheSet,
  cacheGet,
  resetCache: (): void => cache.clear(),
};
