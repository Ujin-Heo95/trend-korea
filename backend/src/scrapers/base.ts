import type { Pool } from 'pg';
import type { ScrapedPost } from './types.js';
import { clusterPosts } from '../services/dedup.js';

export abstract class BaseScraper {
  category?: string;

  constructor(protected pool: Pool) {}
  abstract fetch(): Promise<ScrapedPost[]>;

  async saveToDb(posts: ScrapedPost[]): Promise<number> {
    if (!posts.length) return 0;

    const COLS = 11;
    const values: unknown[] = [];
    const placeholders = posts.map((p, i) => {
      const b = i * COLS;
      values.push(
        p.sourceKey, p.sourceName, p.title, p.url,
        p.thumbnail ?? null, p.author ?? null,
        p.viewCount ?? 0, p.commentCount ?? 0, p.publishedAt ?? null,
        p.category ?? this.category ?? null,
        p.metadata ? JSON.stringify(p.metadata) : null,
      );
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11})`;
    });

    const category = posts[0].category ?? this.category ?? null;
    const isRankedCategory = ['movie', 'performance'].includes(category ?? '');

    // 랭킹 데이터는 UPSERT로 관객수/메타데이터 갱신, 일반 데이터는 DO NOTHING
    const conflictClause = isRankedCategory
      ? `ON CONFLICT (url) DO UPDATE SET
           title = EXCLUDED.title,
           view_count = EXCLUDED.view_count,
           comment_count = EXCLUDED.comment_count,
           metadata = EXCLUDED.metadata,
           thumbnail = EXCLUDED.thumbnail,
           scraped_at = NOW()`
      : 'ON CONFLICT (url) DO NOTHING';

    const result = await this.pool.query(
      `INSERT INTO posts (source_key,source_name,title,url,thumbnail,author,view_count,comment_count,published_at,category,metadata)
       VALUES ${placeholders.join(',')} ${conflictClause}`,
      values
    );
    return result.rowCount ?? 0;
  }

  async run(): Promise<{ count: number; error?: string }> {
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const posts = await this.fetch();
        const count = await this.saveToDb(posts);
        // 랭킹 데이터(영화/공연)는 단일 소스이므로 클러스터 중복제거 불필요
        const skipDedup = ['movie', 'performance'].includes(this.category ?? '');
        if (!skipDedup) {
          await clusterPosts(this.pool, posts);
        }
        return { count };
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          const delay = 2000 * Math.pow(4, attempt);
          console.warn(`[scraper] retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms: ${String(err)}`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return { count: 0, error: String(err) };
      }
    }
    return { count: 0, error: 'unreachable' };
  }
}
