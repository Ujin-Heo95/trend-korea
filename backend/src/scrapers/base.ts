import type { Pool } from 'pg';
import type { ScrapedPost } from './types.js';
import { clusterPosts } from '../services/dedup.js';
import { logger } from '../utils/logger.js';

const MAX_TITLE_LEN = 300;
const MAX_AUTHOR_LEN = 100;
const MAX_URL_LEN = 2048;
const MAX_METADATA_BYTES = 8192;

// ── Circuit Breaker ────────────────────────────────────
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

const circuitStates = new Map<string, CircuitState>();

function getCircuitState(sourceKey: string): CircuitState {
  let state = circuitStates.get(sourceKey);
  if (!state) {
    state = { failures: 0, openedAt: null };
    circuitStates.set(sourceKey, state);
  }
  return state;
}

/** Exported for testing — reset all circuit breaker states */
export function resetCircuitBreakers(): void {
  circuitStates.clear();
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

export abstract class BaseScraper {
  category?: string;
  subcategory?: string;

  constructor(protected pool: Pool) {}
  abstract fetch(): Promise<ScrapedPost[]>;

  async saveToDb(posts: ScrapedPost[]): Promise<number> {
    if (!posts.length) return 0;

    const COLS = 13;
    const values: unknown[] = [];
    const placeholders = posts.map((p, i) => {
      const b = i * COLS;
      const metaJson = p.metadata ? JSON.stringify(p.metadata) : null;
      values.push(
        truncate(stripHtml(p.sourceKey), 100),
        truncate(stripHtml(p.sourceName), 100),
        truncate(stripHtml(p.title), MAX_TITLE_LEN),
        truncate(p.url, MAX_URL_LEN),
        p.thumbnail ? truncate(p.thumbnail, MAX_URL_LEN) : null,
        p.author ? truncate(stripHtml(p.author), MAX_AUTHOR_LEN) : null,
        p.viewCount ?? 0, p.commentCount ?? 0, p.likeCount ?? 0,
        p.publishedAt ?? null,
        p.category ?? this.category ?? null,
        p.subcategory ?? this.subcategory ?? null,
        metaJson && metaJson.length <= MAX_METADATA_BYTES ? metaJson : null,
      );
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13})`;
    });

    const category = posts[0].category ?? this.category ?? null;
    const isRankedCategory = ['movie', 'performance', 'music', 'books', 'ott'].includes(category ?? '');

    // 랭킹 데이터는 UPSERT로 관객수/메타데이터 갱신
    // 일반 데이터는 engagement GREATEST + scraped_at 갱신
    // scraped_at 갱신 필수: TTL cleanup이 scraped_at 기준이므로 갱신 안 하면 활발히 수집되는 포스트도 삭제됨
    const conflictClause = isRankedCategory
      ? `ON CONFLICT (url) DO UPDATE SET
           title = EXCLUDED.title,
           view_count = EXCLUDED.view_count,
           comment_count = EXCLUDED.comment_count,
           like_count = EXCLUDED.like_count,
           metadata = EXCLUDED.metadata,
           thumbnail = EXCLUDED.thumbnail,
           scraped_at = NOW()`
      : `ON CONFLICT (url) DO UPDATE SET
           view_count = GREATEST(posts.view_count, EXCLUDED.view_count),
           comment_count = GREATEST(posts.comment_count, EXCLUDED.comment_count),
           like_count = GREATEST(posts.like_count, EXCLUDED.like_count),
           scraped_at = NOW()`;

    const result = await this.pool.query(
      `INSERT INTO posts (source_key,source_name,title,url,thumbnail,author,view_count,comment_count,like_count,published_at,category,subcategory,metadata)
       VALUES ${placeholders.join(',')} ${conflictClause}`,
      values
    );

    // Engagement 스냅샷: 이미 DB에 있는 게시글의 현재 engagement 기록 (velocity 계산용)
    await this.recordEngagementSnapshots(posts);

    return result.rowCount ?? 0;
  }

  /** 기존 게시글의 engagement 스냅샷을 engagement_snapshots에 배치 기록 */
  private async recordEngagementSnapshots(posts: ScrapedPost[]): Promise<void> {
    const withEngagement = posts.filter(p => (p.viewCount ?? 0) > 0 || (p.commentCount ?? 0) > 0 || (p.likeCount ?? 0) > 0);
    if (!withEngagement.length) return;

    try {
      const urls = withEngagement.map(p => p.url);
      const existing = await this.pool.query<{ id: number; url: string }>(
        `SELECT id, url FROM posts WHERE url = ANY($1::text[])`,
        [urls]
      );
      if (!existing.rows.length) return;

      const urlToPostId = new Map(existing.rows.map(r => [r.url, r.id]));
      const snapValues: unknown[] = [];
      const snapPlaceholders: string[] = [];

      for (const p of withEngagement) {
        const postId = urlToPostId.get(p.url);
        if (!postId) continue;
        const i = snapValues.length;
        snapValues.push(postId, p.viewCount ?? 0, p.commentCount ?? 0, p.likeCount ?? 0);
        snapPlaceholders.push(`($${i + 1},$${i + 2},$${i + 3},$${i + 4})`);
      }

      if (snapPlaceholders.length > 0) {
        await this.pool.query(
          `INSERT INTO engagement_snapshots (post_id, view_count, comment_count, like_count)
           VALUES ${snapPlaceholders.join(',')}`,
          snapValues
        );
      }
    } catch (err) {
      // 스냅샷 실패는 스크래핑 자체를 중단시키지 않음
      logger.warn({ err }, '[scraper] engagement snapshot failed');
    }
  }

  /** Source key used for circuit breaker tracking — subclasses can set sourceKey property */
  protected getSourceKey(): string {
    return (this as unknown as { sourceKey?: string }).sourceKey ?? this.constructor.name;
  }

  async run(): Promise<{ count: number; error?: string }> {
    // ── Circuit Breaker check ──
    const cbState = getCircuitState(this.getSourceKey());
    if (cbState.openedAt !== null) {
      const elapsed = Date.now() - cbState.openedAt;
      if (elapsed < CIRCUIT_BREAKER_COOLDOWN_MS) {
        const remainMin = Math.ceil((CIRCUIT_BREAKER_COOLDOWN_MS - elapsed) / 60_000);
        return { count: 0, error: `circuit open — skipping (${remainMin}min remaining)` };
      }
      // Cooldown expired — close circuit and retry
      logger.info({ sourceKey: this.getSourceKey() }, '[scraper] circuit breaker closed, resuming');
      cbState.openedAt = null;
      cbState.failures = 0;
    }

    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const posts = await this.fetch();
        if (posts.length === 0) {
          logger.warn({ sourceKey: this.getSourceKey() }, '[scraper] 0 posts returned — possible selector/feed issue');
        }
        const count = await this.saveToDb(posts);
        // 랭킹 데이터(영화/공연)는 단일 소스이므로 클러스터 중복제거 불필요
        const skipDedup = ['movie', 'performance', 'music', 'books', 'ott'].includes(this.category ?? '');
        if (!skipDedup) {
          await clusterPosts(this.pool, posts);
        }
        // Success — reset circuit breaker
        cbState.failures = 0;
        return { count };
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          const delay = 2000 * Math.pow(4, attempt);
          logger.warn({ sourceKey: this.getSourceKey(), attempt: attempt + 1, delay }, '[scraper] retrying');
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        // All retries exhausted — increment circuit breaker
        cbState.failures += 1;
        if (cbState.failures >= CIRCUIT_BREAKER_THRESHOLD) {
          cbState.openedAt = Date.now();
          logger.error({ sourceKey: this.getSourceKey(), failures: cbState.failures }, '[scraper] circuit breaker OPEN — skipping for 1 hour');
        }
        return { count: 0, error: String(err) };
      }
    }
    return { count: 0, error: 'unreachable' };
  }
}
