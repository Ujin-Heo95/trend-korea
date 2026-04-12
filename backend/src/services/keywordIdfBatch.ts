/**
 * keywordIdfBatch — 트렌드 키워드의 IDF(역문서빈도)를 코퍼스에서 자동 측정.
 *
 * 목적: issueAggregator.mergeViaTrendKeywords의 단일 키워드 공유 병합 문제를 해결하기 위한
 * 데이터 기반 신호 소스. 최근 12h posts.title을 코퍼스로 보고, 각 trend_keyword가
 * 코퍼스에 substring 매칭되는 문서 수(df)를 세어 idf를 산출한다.
 *
 *   idf = ln((N + 1) / (df + 1)) + 1   // smoothing, 항상 > 0
 *
 * 광범위 키워드("정부", "한국")는 df가 커서 idf가 작고, 사건 고유 키워드("탄핵", "표결")는
 * df가 작아 idf가 크다. 병합 판정에서 IDF 합이 임계값을 넘어야 union을 허용한다(Phase 2).
 *
 * Phase 1에서는 테이블만 채우고, 병합 로직은 그대로 둔다.
 */

import type { Pool } from 'pg';
import { normalizeTitle } from './dedup.js';

const WINDOW_HOURS = 12;
const MAX_KEYWORDS = 1000;
const MAX_POSTS = 200_000;

export interface KeywordIdfStats {
  readonly keywordsProcessed: number;
  readonly docCount: number;
  readonly minIdf: number;
  readonly maxIdf: number;
  readonly avgIdf: number;
  readonly elapsedMs: number;
}

interface KeywordRow {
  keyword_normalized: string;
}

interface PostRow {
  title: string;
}

/**
 * 코퍼스의 정규화된 제목 배열을 받아 키워드별 df/idf를 계산한다.
 * 순수 함수 — 테스트 가능. DB 의존 없음.
 */
export function computeIdfMap(
  normalizedTitles: readonly string[],
  keywords: readonly string[],
): Map<string, { df: number; idf: number }> {
  const N = normalizedTitles.length;
  const result = new Map<string, { df: number; idf: number }>();
  if (keywords.length === 0) return result;

  // 키워드 중복 제거
  const uniqueKeywords = Array.from(new Set(keywords.filter(k => k && k.length > 0)));

  for (const kw of uniqueKeywords) {
    let df = 0;
    // substring 매칭: 정규화된 제목에 키워드가 포함된 문서 수.
    // 공백 제거 변형까지 확인해 buildKeywordIndex/matchPostToKeywords와 정합 유지.
    const kwStripped = kw.replace(/\s/g, '');
    for (const title of normalizedTitles) {
      if (title.includes(kw)) {
        df++;
      } else if (kwStripped.length >= 4 && title.replace(/\s/g, '').includes(kwStripped)) {
        df++;
      }
    }
    const idf = Math.log((N + 1) / (df + 1)) + 1;
    result.set(kw, { df, idf });
  }

  return result;
}

/**
 * 12h 윈도우 코퍼스를 DB에서 읽어 IDF를 계산하고 keyword_idf 테이블에 UPSERT.
 * 5분 주기로 호출 (스케줄러에서 스코어링 직후).
 */
export async function runKeywordIdfBatch(pool: Pool): Promise<KeywordIdfStats> {
  const start = Date.now();

  // 1. 코퍼스 — 최근 12h posts 제목
  const postsResult = await pool.query<PostRow>(
    `SELECT title FROM posts
     WHERE scraped_at > NOW() - $1 * INTERVAL '1 hour'
       AND title IS NOT NULL
       AND title <> ''
     LIMIT $2`,
    [WINDOW_HOURS, MAX_POSTS],
  );

  const normalizedTitles = postsResult.rows.map(r => normalizeTitle(r.title));
  const docCount = normalizedTitles.length;

  // 2. 키워드 모집단 — 활성 trend_keywords
  const kwResult = await pool.query<KeywordRow>(
    `SELECT DISTINCT keyword_normalized
     FROM trend_keywords
     WHERE expires_at > NOW()
       AND keyword_normalized IS NOT NULL
       AND keyword_normalized <> ''
     LIMIT $1`,
    [MAX_KEYWORDS],
  );

  const keywords = kwResult.rows.map(r => r.keyword_normalized);

  if (keywords.length === 0 || docCount === 0) {
    console.log(`[keywordIdfBatch] skipped — keywords=${keywords.length} docCount=${docCount}`);
    return {
      keywordsProcessed: 0,
      docCount,
      minIdf: 0,
      maxIdf: 0,
      avgIdf: 0,
      elapsedMs: Date.now() - start,
    };
  }

  // 3. IDF 계산 (순수 함수)
  const idfMap = computeIdfMap(normalizedTitles, keywords);

  // 4. UPSERT — 단일 multi-row INSERT로 묶어 round-trip 최소화
  const values: (string | number)[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const [kw, { df, idf }] of idfMap) {
    placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, NOW())`);
    values.push(kw, df, idf, docCount);
  }

  if (placeholders.length > 0) {
    await pool.query(
      `INSERT INTO keyword_idf (keyword_normalized, df, idf, doc_count, computed_at)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (keyword_normalized) DO UPDATE SET
         df = EXCLUDED.df,
         idf = EXCLUDED.idf,
         doc_count = EXCLUDED.doc_count,
         computed_at = EXCLUDED.computed_at`,
      values,
    );
  }

  // 5. 통계 로깅
  let minIdf = Infinity;
  let maxIdf = -Infinity;
  let sum = 0;
  for (const { idf } of idfMap.values()) {
    if (idf < minIdf) minIdf = idf;
    if (idf > maxIdf) maxIdf = idf;
    sum += idf;
  }
  const avgIdf = idfMap.size > 0 ? sum / idfMap.size : 0;
  const elapsedMs = Date.now() - start;

  console.log(
    `[keywordIdfBatch] processed=${idfMap.size} docs=${docCount} ` +
    `idf=[${minIdf.toFixed(2)}..${maxIdf.toFixed(2)}] avg=${avgIdf.toFixed(2)} elapsed=${elapsedMs}ms`,
  );

  return {
    keywordsProcessed: idfMap.size,
    docCount,
    minIdf: idfMap.size > 0 ? minIdf : 0,
    maxIdf: idfMap.size > 0 ? maxIdf : 0,
    avgIdf,
    elapsedMs,
  };
}

/**
 * IDF 캐시 커버리지(%): 활성 trend_keywords 중 keyword_idf 캐시에 행이 있는 비율.
 * 모니터링용 — 50% 미만이 30분 지속 시 Discord 알림.
 */
export async function getKeywordIdfCoverage(pool: Pool): Promise<number> {
  const result = await pool.query<{ active: number; cached: number }>(
    `SELECT
        (SELECT COUNT(DISTINCT keyword_normalized)::int
           FROM trend_keywords WHERE expires_at > NOW()) AS active,
        (SELECT COUNT(*)::int
           FROM keyword_idf
          WHERE keyword_normalized IN (
            SELECT DISTINCT keyword_normalized
              FROM trend_keywords
             WHERE expires_at > NOW()
          )
          AND computed_at > NOW() - INTERVAL '1 hour') AS cached`,
  );
  const row = result.rows[0];
  if (!row || row.active === 0) return 0;
  return row.cached / row.active;
}

/** 24h 이상 stale한 keyword_idf 행 정리 — cleanup에서 호출 */
export async function cleanStaleKeywordIdf(pool: Pool): Promise<number> {
  const result = await pool.query(
    `DELETE FROM keyword_idf WHERE computed_at < NOW() - INTERVAL '24 hours'`,
  );
  return result.rowCount ?? 0;
}
