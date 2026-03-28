import type { FastifyInstance } from 'fastify';

export async function postsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { source?: string; page?: string; limit?: string } }>(
    '/api/posts',
    async (req) => {
      const source = req.query.source;
      const limit  = Math.min(parseInt(req.query.limit  ?? '30'), 100);
      const page   = Math.max(parseInt(req.query.page   ?? '1'),  1);
      const offset = (page - 1) * limit;

      const params: unknown[] = [];
      const where = source ? `WHERE source_key = $${params.push(source)}` : '';

      const [rows, count] = await Promise.all([
        app.pg.query(
          `SELECT id,source_key,source_name,title,url,thumbnail,author,view_count,comment_count,published_at,scraped_at
           FROM posts ${where} ORDER BY scraped_at DESC LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
          params
        ),
        app.pg.query(
          `SELECT COUNT(*)::int AS total FROM posts ${where}`,
          source ? [source] : []
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
