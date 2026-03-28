import type { Pool } from 'pg';
import type { ScrapedPost } from './types.js';

export abstract class BaseScraper {
  constructor(protected pool: Pool) {}
  abstract fetch(): Promise<ScrapedPost[]>;

  async saveToDb(posts: ScrapedPost[]): Promise<number> {
    if (!posts.length) return 0;

    const COLS = 9;
    const values: unknown[] = [];
    const placeholders = posts.map((p, i) => {
      const b = i * COLS;
      values.push(
        p.sourceKey, p.sourceName, p.title, p.url,
        p.thumbnail ?? null, p.author ?? null,
        p.viewCount ?? 0, p.commentCount ?? 0, p.publishedAt ?? null,
      );
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`;
    });

    const result = await this.pool.query(
      `INSERT INTO posts (source_key,source_name,title,url,thumbnail,author,view_count,comment_count,published_at)
       VALUES ${placeholders.join(',')} ON CONFLICT (url) DO NOTHING`,
      values
    );
    return result.rowCount ?? 0;
  }

  async run(): Promise<{ count: number; error?: string }> {
    try {
      const posts = await this.fetch();
      const count = await this.saveToDb(posts);
      return { count };
    } catch (err) {
      return { count: 0, error: String(err) };
    }
  }
}
