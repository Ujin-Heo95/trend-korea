import type { Pool } from 'pg';
import type { TrendKeywordInput } from './types.js';
import { BaseScraper } from './base.js';
import { logger } from '../utils/logger.js';

const MAX_METADATA_BYTES = 8192;

/**
 * 트렌드 신호 스크래퍼 베이스.
 * posts 테이블 대신 trend_keywords에 직접 기록.
 * BaseScraper의 run() retry/circuit-breaker를 그대로 활용하되
 * saveToDb → saveTrendKeywords로 대체.
 */
export abstract class TrendSignalScraper extends BaseScraper {
  /** 서브클래스가 구현: 트렌드 키워드 배열 반환 */
  abstract fetchTrendKeywords(): Promise<TrendKeywordInput[]>;

  /** fetch()는 빈 배열 반환 — run() 오버라이드로 사용하지 않음 */
  async fetch(): Promise<never[]> {
    return [];
  }

  /** trend_keywords 테이블에 배치 UPSERT */
  async saveTrendKeywords(entries: TrendKeywordInput[]): Promise<number> {
    if (!entries.length) return 0;

    const COLS = 8;
    const values: unknown[] = [];
    const placeholders = entries.map((e, i) => {
      const b = i * COLS;
      const metaJson = e.metadata ? JSON.stringify(e.metadata) : null;
      values.push(
        e.keyword,
        normalizeKeyword(e.keyword),
        e.sourceKey,
        Math.min(Math.max(e.signalStrength, 0), 1.0),
        metaJson && metaJson.length <= MAX_METADATA_BYTES ? metaJson : null,
        e.rankPosition ?? null,
        e.rankDirection ?? null,
        e.rankChange ?? 0,
      );
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5}::jsonb,NOW(),NOW() + INTERVAL '12 hours',$${b+6},$${b+7},$${b+8})`;
    });

    const result = await this.pool.query(
      `INSERT INTO trend_keywords
         (keyword, keyword_normalized, source_key, signal_strength, metadata, scraped_at, expires_at, rank_position, rank_direction, rank_change)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (keyword_normalized, source_key) DO UPDATE SET
         keyword = EXCLUDED.keyword,
         signal_strength = EXCLUDED.signal_strength,
         metadata = EXCLUDED.metadata,
         scraped_at = EXCLUDED.scraped_at,
         expires_at = EXCLUDED.expires_at,
         rank_position = EXCLUDED.rank_position,
         rank_direction = EXCLUDED.rank_direction,
         rank_change = EXCLUDED.rank_change`,
      values,
    );

    return result.rowCount ?? 0;
  }

  /** BaseScraper.run() 오버라이드: fetchTrendKeywords → saveTrendKeywords */
  override async run(): Promise<{ count: number; error?: string }> {
    // circuit breaker는 BaseScraper.run() 내부에서 처리되지만
    // 우리는 별도 흐름이므로 동일 로직을 인라인
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const entries = await this.fetchTrendKeywords();
        if (entries.length === 0) {
          logger.warn({ sourceKey: this.getSourceKey() }, '[trend-scraper] 0 keywords returned');
        }
        const count = await this.saveTrendKeywords(entries);
        return { count };
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          const delay = 2000 * Math.pow(4, attempt);
          logger.warn({ sourceKey: this.getSourceKey(), attempt: attempt + 1, delay }, '[trend-scraper] retrying');
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return { count: 0, error: String(err) };
      }
    }
    return { count: 0, error: 'unreachable' };
  }
}

/** 키워드 정규화: 소문자 + 공백 정리 */
function normalizeKeyword(kw: string): string {
  return kw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
