import type { FastifyInstance } from 'fastify';

export async function postsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { source?: string; category?: string; q?: string; page?: string; limit?: string } }>(
    '/api/posts',
    async (req) => {
      const { source, category, q } = req.query;
      const limit  = Math.min(parseInt(req.query.limit  ?? '30'), 100);
      const page   = Math.max(parseInt(req.query.page   ?? '1'),  1);
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (source) conditions.push(`source_key = $${params.push(source)}`);
      if (category) conditions.push(`category = $${params.push(category)}`);
      if (q) conditions.push(`title ILIKE $${params.push(`%${q}%`)}`);

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const [rows, count] = await Promise.all([
        app.pg.query(
          `SELECT id,source_key,source_name,title,url,thumbnail,author,view_count,comment_count,published_at,scraped_at,category
           FROM posts ${where} ORDER BY scraped_at DESC LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
          params
        ),
        app.pg.query(
          `SELECT COUNT(*)::int AS total FROM posts ${where}`,
          params.slice(0, conditions.length)
        ),
      ]);
      return { posts: rows.rows, total: count.rows[0].total, page, limit };
    }
  );

  app.get('/api/posts/trending', async () => {
    const r = await app.pg.query(
      `SELECT * FROM posts WHERE scraped_at > NOW() - INTERVAL '1 hour' ORDER BY view_count DESC LIMIT 20`
    );
    return { posts: r.rows };
  });
}
