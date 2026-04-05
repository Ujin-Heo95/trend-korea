/**
 * API 호출 횟수 추적 — 일일 쿼터 소진 방지.
 * 인메모리 카운터 (프로세스 재시작 시 리셋됨 — acceptable).
 */

import { logger } from '../utils/logger.js';

interface QuotaEntry {
  count: number;
  resetAt: number; // midnight UTC
}

const counters = new Map<string, QuotaEntry>();

function nextMidnightUtc(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

function getEntry(apiKey: string): QuotaEntry {
  let entry = counters.get(apiKey);
  if (!entry || Date.now() >= entry.resetAt) {
    entry = { count: 0, resetAt: nextMidnightUtc() };
    counters.set(apiKey, entry);
  }
  return entry;
}

/** API 호출 전 쿼터 확인. 초과 시 false 반환 */
export function checkQuota(apiKey: string, dailyLimit: number): boolean {
  const entry = getEntry(apiKey);
  if (entry.count >= dailyLimit) {
    logger.warn({ apiKey, count: entry.count, limit: dailyLimit }, '[quota] daily limit reached');
    return false;
  }
  return true;
}

/** API 호출 완료 후 카운터 증가 */
export function incrementQuota(apiKey: string, amount = 1): void {
  const entry = getEntry(apiKey);
  entry.count += amount;
}

/** 현재 사용량 조회 (어드민 API용) */
export function getQuotaStatus(): Record<string, { used: number; resetAt: string }> {
  const result: Record<string, { used: number; resetAt: string }> = {};
  for (const [key, entry] of counters) {
    if (Date.now() < entry.resetAt) {
      result[key] = {
        used: entry.count,
        resetAt: new Date(entry.resetAt).toISOString(),
      };
    }
  }
  return result;
}
