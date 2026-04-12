import type { FastifyInstance } from 'fastify';

const BASE_URL = 'https://weeklit.net';

/**
 * 정적 페이지 목록. path 기반 라우트(2026-04-12 SEO 리팩터 이후).
 * 쿼리스트링 카테고리 URL은 `_redirects`와 botDetect 미들웨어에서 301로 처리됨.
 */
const STATIC_PAGES = [
  { loc: '/', changefreq: 'always', priority: '1.0' },
  { loc: '/realtime', changefreq: 'always', priority: '0.95' },
  { loc: '/community', changefreq: 'always', priority: '0.9' },
  { loc: '/news', changefreq: 'always', priority: '0.9' },
  { loc: '/video', changefreq: 'always', priority: '0.85' },
  { loc: '/portal', changefreq: 'always', priority: '0.85' },
  { loc: '/deals', changefreq: 'always', priority: '0.8' },
  { loc: '/entertainment', changefreq: 'always', priority: '0.85' },
  { loc: '/weather', changefreq: 'hourly', priority: '0.5' },
  { loc: '/fortune', changefreq: 'daily', priority: '0.4' },
  { loc: '/games', changefreq: 'weekly', priority: '0.4' },
  { loc: '/about', changefreq: 'monthly', priority: '0.3' },
  { loc: '/privacy', changefreq: 'monthly', priority: '0.2' },
];

function urlEntry(loc: string, changefreq: string, priority: string, lastmod?: string): string {
  const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
  return `  <url><loc>${BASE_URL}${loc}</loc>${lastmodTag}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

export async function sitemapRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sitemap.xml', async (_req, reply) => {
    const staticEntries = STATIC_PAGES.map(p => urlEntry(p.loc, p.changefreq, p.priority));

    // 이슈 상세 페이지 (최근 14일, 최대 2000개) — long-tail 유입 확보
    const { rows: posts } = await app.pg.query<{ id: number; scraped_at: string }>(
      `SELECT id, scraped_at FROM posts
       WHERE scraped_at > NOW() - INTERVAL '14 days'
       ORDER BY scraped_at DESC LIMIT 2000`,
    );
    const postEntries = posts.map(p => {
      const lastmod = p.scraped_at.split('T')[0];
      return urlEntry(`/issue/${p.id}`, 'daily', '0.6', lastmod);
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...postEntries].join('\n')}
</urlset>`;

    return reply
      .type('application/xml; charset=utf-8')
      .header('cache-control', 'public, max-age=3600')
      .send(xml);
  });
}
