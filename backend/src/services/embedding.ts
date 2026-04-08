/**
 * Gemini Embedding Service — 제목 임베딩 생성 + 인메모리 캐시 + 코사인 유사도.
 * 네이버의 TF-IDF + 코사인 유사도를 Gemini text-embedding-004로 대체.
 * 비용: ~$0.06/월 (324K 토큰/일 × $0.00625/1M)
 */
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const EMBEDDING_MODEL = 'text-embedding-004';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간
const BATCH_SIZE = 100; // batchEmbedContents 최대 요청 수

// ─── Cache ───

interface CachedEmbedding {
  readonly vector: Float32Array;
  readonly cachedAt: number;
}

/** postId → 임베딩 벡터 캐시. TTL 6시간, ~22MB at 7200 posts × 768 dims × 4B */
const embeddingCache = new Map<number, CachedEmbedding>();

/** 만료된 캐시 엔트리 정리 */
function pruneCache(): void {
  const now = Date.now();
  for (const [id, entry] of embeddingCache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      embeddingCache.delete(id);
    }
  }
}

// ─── Client ───

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (!config.geminiApiKey) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAI;
}

// ─── Public API ───

export interface PostForEmbedding {
  readonly id: number;
  readonly title: string;
}

/**
 * 새 포스트의 임베딩을 배치 생성. 이미 캐시된 포스트는 스킵.
 * @returns 성공적으로 임베딩된 포스트 수
 */
export async function generateEmbeddings(posts: readonly PostForEmbedding[]): Promise<number> {
  const client = getClient();
  if (!client) return 0;

  pruneCache();

  // 캐시에 없는 포스트만 필터
  const uncached = posts.filter(p => !embeddingCache.has(p.id));
  if (uncached.length === 0) return 0;

  const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });
  let generated = 0;

  // 배치 단위로 처리
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE);

    try {
      const result = await model.batchEmbedContents({
        requests: batch.map(p => ({
          content: { role: 'user', parts: [{ text: p.title }] },
          taskType: TaskType.CLUSTERING,
        })),
      });

      for (let j = 0; j < result.embeddings.length; j++) {
        const values = result.embeddings[j].values;
        embeddingCache.set(batch[j].id, {
          vector: new Float32Array(values),
          cachedAt: Date.now(),
        });
        generated++;
      }
    } catch (err) {
      logger.warn({ err, batchSize: batch.length }, '[embedding] batch embed failed');
      // 실패 시 다음 배치 계속 시도
    }
  }

  return generated;
}

/**
 * 두 포스트 ID 간 코사인 유사도 계산.
 * @returns 유사도 [0, 1] 또는 null (임베딩 미존재)
 */
export function cosineSimilarity(postIdA: number, postIdB: number): number | null {
  const a = embeddingCache.get(postIdA);
  const b = embeddingCache.get(postIdB);
  if (!a || !b) return null;

  return cosineSimVectors(a.vector, b.vector);
}

/** Float32Array 벡터 간 코사인 유사도 */
export function cosineSimVectors(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 포스트 ID의 임베딩 벡터를 반환.
 * @returns Float32Array 또는 null
 */
export function getEmbedding(postId: number): Float32Array | null {
  return embeddingCache.get(postId)?.vector ?? null;
}

/** 캐시 크기 반환 (모니터링용) */
export function getEmbeddingCacheSize(): number {
  return embeddingCache.size;
}

/** 테스트용: 캐시 초기화 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

// ─── Scheduler Integration ───

import type { Pool } from 'pg';

let isGeneratingEmbeddings = false;
let embeddingStartedAt = 0;
const EMBEDDING_TIMEOUT_MS = 5 * 60_000; // 5분 타임아웃

/**
 * 최근 6시간 이슈 대상 포스트의 임베딩을 생성.
 * 스케줄러에서 calculateScores() 직후, aggregateIssues() 전에 호출.
 */
export async function generateEmbeddingsForRecentPosts(pool: Pool): Promise<void> {
  if (isGeneratingEmbeddings) {
    const elapsed = Date.now() - embeddingStartedAt;
    if (elapsed < EMBEDDING_TIMEOUT_MS) {
      logger.warn('[embedding] skipping — previous run still active');
      return;
    }
    logger.warn(`[embedding] force-releasing stale lock (${Math.round(elapsed / 1000)}s old)`);
    isGeneratingEmbeddings = false;
  }
  isGeneratingEmbeddings = true;
  embeddingStartedAt = Date.now();
  try {
    const { rows } = await pool.query<{ id: number; title: string }>(
      `SELECT id, title FROM posts
       WHERE scraped_at > NOW() - INTERVAL '6 hours'
         AND COALESCE(category, '') IN ('news','press','community','video','video_popular')
       ORDER BY scraped_at DESC
       LIMIT 1000`,
    );

    if (rows.length === 0) return;

    const count = await generateEmbeddings(rows.map(r => ({ id: r.id, title: r.title })));
    if (count > 0) {
      logger.info({ generated: count, cached: embeddingCache.size }, '[embedding] batch complete');
    }
  } finally {
    isGeneratingEmbeddings = false;
  }
}

// ─── Periodic Cache Pruning ───

setInterval(() => {
  const before = embeddingCache.size;
  pruneCache();
  const pruned = before - embeddingCache.size;
  if (pruned > 0) {
    logger.info({ pruned, remaining: embeddingCache.size }, '[embedding] periodic cache prune');
  }
}, 60 * 60_000); // 1시간마다
