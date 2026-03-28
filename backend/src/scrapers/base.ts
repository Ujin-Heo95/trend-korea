import type { Pool } from 'pg';
import type { ScrapedPost } from './types.js';

export abstract class BaseScraper {
  constructor(protected pool: Pool) {}

  abstract fetch(): Promise<ScrapedPost[]>;

  async saveToDb(posts: ScrapedPost[]): Promise<number> {
    if (!posts.length) return 0;

    let saved = 0;
    for (const p of posts) {
      const result = await this.pool.query(
        `INSERT INTO posts (source_key, source_name, title, url, thumbnail, author, view_count, comment_count, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (url) DO NOTHING`,
        [
          p.sourceKey,
          p.sourceName,
          p.title,
          p.url,
          p.thumbnail ?? null,
          p.author ?? null,
          p.viewCount ?? 0,
          p.commentCount ?? 0,
          p.publishedAt ?? null,
        ]
      );
      saved += result.rowCount ?? 0;
    }

    return saved;
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
