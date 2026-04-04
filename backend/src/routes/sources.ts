import type { FastifyInstance } from 'fastify';
import { getSourceMeta } from '../scrapers/registry.js';
import type { PostStatsRow, RunStatsRow } from '../db/types.js';

export async function sourcesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sources', async () => {
    const sourceMeta = getSourceMeta();

    const [postStats, runStats] = await Promise.all([
      app.pg.query(
        `SELECT source_key, COUNT(*)::int AS post_count, MAX(scraped_at) AS last_updated FROM posts GROUP BY source_key`
      ),
      app.pg.query(
        `SELECT source_key,
                COUNT(*)::int AS total_runs_24h,
                COUNT(*) FILTER (WHERE error_message IS NULL)::int AS success_runs_24h,
                ROUND(AVG(posts_saved) FILTER (WHERE error_message IS NULL), 1)::float AS avg_posts_per_run
         FROM scraper_runs
         WHERE started_at > NOW() - INTERVAL '24 hours'
         GROUP BY source_key`
      ),
    ]);

    const posts = Object.fromEntries((postStats.rows as PostStatsRow[]).map(r => [r.source_key, r]));
    const runs = Object.fromEntries((runStats.rows as RunStatsRow[]).map(r => [r.source_key, r]));

    return sourceMeta.map(s => {
      const p = posts[s.key];
      const r = runs[s.key];
      const totalRuns = r?.total_runs_24h ?? 0;
      const successRuns = r?.success_runs_24h ?? 0;
      return {
        ...s,
        post_count: p?.post_count ?? 0,
        last_updated: p?.last_updated ?? null,
        success_rate_24h: totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) / 100 : null,
        avg_posts_per_run: r?.avg_posts_per_run ?? null,
      };
    });
  });
}
