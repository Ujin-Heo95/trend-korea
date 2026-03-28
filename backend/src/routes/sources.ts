import type { FastifyInstance } from 'fastify';

const SOURCE_META = [
  { key: 'dcinside',   name: 'DC인사이드', category: 'community' },
  { key: 'fmkorea',    name: '에펨코리아', category: 'community' },
  { key: 'ruliweb',    name: '루리웹',     category: 'community' },
  { key: 'theqoo',     name: '더쿠',       category: 'community' },
  { key: 'instiz',     name: '인스티즈',   category: 'community' },
  { key: 'natepann',   name: '네이트판',   category: 'community' },
  { key: 'clien',      name: '클리앙',     category: 'community' },
  { key: 'ppomppu',    name: '뽐뿌',       category: 'community' },
  { key: 'todayhumor', name: '오늘의유머', category: 'community' },
  { key: 'youtube',    name: 'YouTube',    category: 'video'     },
  { key: 'yna',        name: '연합뉴스',   category: 'news'      },
  { key: 'chosun',     name: '조선일보',   category: 'news'      },
  { key: 'hani',       name: '한겨레',     category: 'news'      },
  { key: 'joins',      name: '중앙일보',   category: 'news'      },
] as const;

export async function sourcesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sources', async () => {
    const r = await app.pg.query(
      `SELECT source_key, COUNT(*)::int AS post_count, MAX(scraped_at) AS last_updated FROM posts GROUP BY source_key`
    );
    const stats = Object.fromEntries(r.rows.map((row: any) => [row.source_key, row]));
    return SOURCE_META.map(s => ({ ...s, ...(stats[s.key] ?? { post_count: 0, last_updated: null }) }));
  });
}
