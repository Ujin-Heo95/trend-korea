import type { FastifyInstance } from 'fastify';

const SOURCE_META = [
  { key: 'dcinside',   name: 'DC인사이드', category: 'community' },
  { key: 'bobaedream', name: '보배드림',   category: 'community' },
  { key: 'ruliweb',    name: '루리웹',     category: 'community' },
  { key: 'theqoo',     name: '더쿠',       category: 'community' },
  { key: 'instiz',     name: '인스티즈',   category: 'community' },
  { key: 'natepann',   name: '네이트판',   category: 'community' },
  { key: 'ppomppu',    name: '뽐뿌',       category: 'community' },
  { key: 'todayhumor', name: '오늘의유머', category: 'community' },
  { key: 'youtube',    name: 'YouTube',    category: 'video'     },
  { key: 'yna',        name: '연합뉴스',   category: 'news'      },
  { key: 'hani',       name: '한겨레',     category: 'news'      },
  { key: 'sbs',        name: 'SBS 뉴스',   category: 'news'      },
  { key: 'donga',      name: '동아일보',   category: 'news'      },
] as const;

export async function sourcesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sources', async () => {
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

    const posts = Object.fromEntries(postStats.rows.map((r: any) => [r.source_key, r]));
    const runs = Object.fromEntries(runStats.rows.map((r: any) => [r.source_key, r]));

    return SOURCE_META.map(s => {
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
