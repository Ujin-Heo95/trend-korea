/**
 * tokenStats — 제목 토큰 DF/burst 집계 + 클러스터링 게이트.
 *
 * 목적: v8 anchor 클러스터링이 임베딩 cosine 만으로 attach 하다 보니
 * "집/아파트/주택" 같은 일반명사가 dominant token 인 짧은 한국어 제목들이
 * 무관한 사건끼리 묶이는 사고가 반복됨. 이를 *데이터로* 차단하기 위해
 * 토큰별 등장 빈도를 주기적으로 집계하고, 클러스터 attach 시
 * "두 제목이 high-IDF 토큰을 최소 1개 공유하는가" 를 게이트로 검사한다.
 *
 *   df_24h     : 최근 24h 등장 글 수 → 현재 rate
 *   df_baseline: 최근 14d 등장 글 수 → baseline rate
 *   burst      = (df_24h / N_24h) / (df_baseline / N_baseline)
 *
 * 토큰이 "discriminative (게이트 통과 자격)" 으로 인정되는 조건:
 *   1) rate_24h < DF_RATE_DISCRIMINATIVE  (코퍼스의 1% 미만 등장 → 본질적 희소)
 *   2) burst >= BURST_RATIO_DISCRIMINATIVE (평소엔 흔하지만 지금 폭증 → 진짜 이슈)
 *   3) 알려지지 않은 토큰 (snapshot 에 없음) → discriminative (cold-start 안전)
 *
 * Cold-start (snapshot.stats.size === 0) 은 게이트 자체를 bypass 해
 * 기존 클러스터링 동작을 정확히 보존한다.
 */

import type { Pool } from 'pg';
import { tokenize } from './topicLabeler.js';

export interface TokenStatsEntry {
  readonly df24: number;
  readonly dfBaseline: number;
}

export interface TokenStatsSnapshot {
  readonly stats: ReadonlyMap<string, TokenStatsEntry>;
  readonly docCount24h: number;
  readonly docCountBaseline: number;
  readonly computedAt: Date;
}

const EMPTY_SNAPSHOT: TokenStatsSnapshot = {
  stats: new Map(),
  docCount24h: 0,
  docCountBaseline: 0,
  computedAt: new Date(0),
};

let cachedSnapshot: TokenStatsSnapshot = EMPTY_SNAPSHOT;

/** 튜닝값 — 운영 데이터 1일치 본 후 조정 가능. */
export const TOKEN_STATS_TUNABLES = {
  /** 코퍼스의 이 비율 미만 등장 → 본질적으로 희소 → 게이트 통과 */
  DF_RATE_DISCRIMINATIVE: 0.01,
  /** 평소 대비 이 배율 이상 burst → 게이트 통과 */
  BURST_RATIO_DISCRIMINATIVE: 2.0,
  /** baseline 윈도우 (일) */
  BASELINE_DAYS: 14,
  /** current rate 윈도우 (시간) */
  CURRENT_HOURS: 24,
} as const;

const REBUILD_BATCH_SIZE = 500;

export interface TokenStatsRebuildResult {
  readonly tokenCount: number;
  readonly docCount24h: number;
  readonly docCountBaseline: number;
  readonly durationMs: number;
}

/**
 * 최근 14일 posts 를 스캔해 DF 테이블을 재집계한다.
 * 1h 주기 cron 에서 호출. truncate + bulk insert 로 단순화.
 */
export async function rebuildTokenStats(pool: Pool): Promise<TokenStatsRebuildResult> {
  const start = Date.now();
  const { rows } = await pool.query<{ id: number; title: string; scraped_at: Date }>(
    `SELECT id, title, scraped_at
       FROM posts
      WHERE scraped_at > NOW() - INTERVAL '${TOKEN_STATS_TUNABLES.BASELINE_DAYS} days'
        AND title IS NOT NULL`,
  );

  const df24 = new Map<string, number>();
  const dfBase = new Map<string, number>();
  const cutoff24 = Date.now() - TOKEN_STATS_TUNABLES.CURRENT_HOURS * 60 * 60 * 1000;
  let n24 = 0;
  let nBase = 0;

  for (const row of rows) {
    const tokens = tokenize(row.title);
    if (tokens.size === 0) continue;
    nBase++;
    const inWindow24 = row.scraped_at.getTime() >= cutoff24;
    if (inWindow24) n24++;
    for (const t of tokens) {
      dfBase.set(t, (dfBase.get(t) ?? 0) + 1);
      if (inWindow24) df24.set(t, (df24.get(t) ?? 0) + 1);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE post_title_token_stats');

    const tokens = Array.from(dfBase.keys());
    for (let i = 0; i < tokens.length; i += REBUILD_BATCH_SIZE) {
      const chunk = tokens.slice(i, i + REBUILD_BATCH_SIZE);
      const values: string[] = [];
      const params: unknown[] = [];
      for (const t of chunk) {
        const base = params.length;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        params.push(t, df24.get(t) ?? 0, dfBase.get(t) ?? 0);
      }
      await client.query(
        `INSERT INTO post_title_token_stats (token, df_24h, df_baseline) VALUES ${values.join(',')}`,
        params,
      );
    }

    await client.query(
      `INSERT INTO post_title_token_stats_meta (singleton, doc_count_24h, doc_count_baseline, computed_at)
         VALUES (TRUE, $1, $2, NOW())
       ON CONFLICT (singleton) DO UPDATE SET
         doc_count_24h      = EXCLUDED.doc_count_24h,
         doc_count_baseline = EXCLUDED.doc_count_baseline,
         computed_at        = EXCLUDED.computed_at`,
      [n24, nBase],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // 모듈 캐시 즉시 갱신
  const stats = new Map<string, TokenStatsEntry>();
  for (const [t, b] of dfBase) {
    stats.set(t, { df24: df24.get(t) ?? 0, dfBaseline: b });
  }
  cachedSnapshot = {
    stats,
    docCount24h: n24,
    docCountBaseline: nBase,
    computedAt: new Date(),
  };

  return {
    tokenCount: dfBase.size,
    docCount24h: n24,
    docCountBaseline: nBase,
    durationMs: Date.now() - start,
  };
}

/**
 * DB 에서 최신 snapshot 을 읽어 모듈 캐시에 적재.
 * 파이프라인 tick 시작 시 호출. snapshot 이 비어있으면 EMPTY 반환.
 */
export async function loadTokenStatsSnapshot(pool: Pool): Promise<TokenStatsSnapshot> {
  const meta = await pool.query<{ doc_count_24h: number; doc_count_baseline: number; computed_at: Date }>(
    'SELECT doc_count_24h, doc_count_baseline, computed_at FROM post_title_token_stats_meta WHERE singleton = TRUE',
  );
  if (meta.rows.length === 0) {
    cachedSnapshot = EMPTY_SNAPSHOT;
    return cachedSnapshot;
  }
  const data = await pool.query<{ token: string; df_24h: number; df_baseline: number }>(
    'SELECT token, df_24h, df_baseline FROM post_title_token_stats',
  );
  const stats = new Map<string, TokenStatsEntry>();
  for (const r of data.rows) {
    stats.set(r.token, { df24: r.df_24h, dfBaseline: r.df_baseline });
  }
  cachedSnapshot = {
    stats,
    docCount24h: meta.rows[0].doc_count_24h,
    docCountBaseline: meta.rows[0].doc_count_baseline,
    computedAt: meta.rows[0].computed_at,
  };
  return cachedSnapshot;
}

export function getCachedSnapshot(): TokenStatsSnapshot {
  return cachedSnapshot;
}

/** 테스트 전용 — 캐시 리셋. */
export function _resetCachedSnapshot(): void {
  cachedSnapshot = EMPTY_SNAPSHOT;
}

/**
 * 토큰이 클러스터 attach 게이트를 통과할 자격(=충분히 희소하거나 burst 중)이 있는지.
 * cold-start / unknown 토큰은 항상 true (안전 우선).
 */
export function isDiscriminativeToken(token: string, snapshot: TokenStatsSnapshot): boolean {
  if (snapshot.stats.size === 0 || snapshot.docCountBaseline === 0) return true;
  const entry = snapshot.stats.get(token);
  if (!entry) return true;

  const rate24 = snapshot.docCount24h > 0 ? entry.df24 / snapshot.docCount24h : 0;
  if (rate24 < TOKEN_STATS_TUNABLES.DF_RATE_DISCRIMINATIVE) return true;

  if (entry.dfBaseline > 0) {
    const rateBaseline = entry.dfBaseline / snapshot.docCountBaseline;
    if (rateBaseline > 0) {
      const burst = rate24 / rateBaseline;
      if (burst >= TOKEN_STATS_TUNABLES.BURST_RATIO_DISCRIMINATIVE) return true;
    }
  }
  return false;
}

/**
 * 클러스터 attach 게이트 빌더.
 * 두 제목이 *최소 1개* discriminative 토큰을 공유해야 attach 허용.
 *
 * Cold start (snapshot.stats.size === 0): 항상 true → 동작 변화 없음.
 * 토큰 0개 제목: true → 판단 불가, 코사인 임계만 따른다.
 */
export function makeShareHighIdfGate(
  snapshot: TokenStatsSnapshot,
): (postTitle: string, anchorTitle: string) => boolean {
  if (snapshot.stats.size === 0) return () => true;

  return (postTitle: string, anchorTitle: string): boolean => {
    const a = tokenize(postTitle);
    const b = tokenize(anchorTitle);
    if (a.size === 0 || b.size === 0) return true;
    for (const token of a) {
      if (b.has(token) && isDiscriminativeToken(token, snapshot)) return true;
    }
    return false;
  };
}
