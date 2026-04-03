import type { FastifyInstance } from 'fastify';

const BASE_URL = 'https://weeklit.net';

const STATIC_PAGES = [
  { loc: '/', changefreq: 'always', priority: '1.0' },
  { loc: '/?category=community', changefreq: 'always', priority: '0.8' },
  { loc: '/?category=news', changefreq: 'always', priority: '0.8' },
  { loc: '/?category=tech', changefreq: 'always', priority: '0.8' },
  { loc: '/?category=video', changefreq: 'always', priority: '0.8' },
  { loc: '/?category=finance', changefreq: 'always', priority: '0.8' },
  { loc: '/?category=trend', changefreq: 'always', priority: '0.8' },
  { loc: '/?category=government', changefreq: 'always', priority: '0.7' },
  { loc: '/?category=newsletter', changefreq: 'daily', priority: '0.7' },
  { loc: '/?category=deals', changefreq: 'always', priority: '0.7' },
  { loc: '/keywords', changefreq: 'hourly', priority: '0.6' },
  { loc: '/weather', changefreq: 'hourly', priority: '0.5' },
  { loc: '/about', changefreq: 'monthly', priority: '0.3' },
  { loc: '/privacy', changefreq: 'monthly', priority: '0.2' },
];

function urlEntry(loc: string, changefreq: string, priority: string, lastmod?: string): string {
  const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
  return `  <url><loc>${BASE_URL}${loc}</loc>${lastmodTag}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

export async function sitemapRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sitemap.xml', async (_req, reply) => {
    // 정적 페이지
    const staticEntries = STATIC_PAGES.map(p => urlEntry(p.loc, p.changefreq, p.priority));

    // 이슈 상세 페이지 (최근 3일, 최대 500개)
    const { rows: posts } = await app.pg.query<{ id: number; scraped_at: string }>(
      `SELECT id, scraped_at FROM posts
       WHERE scraped_at > NOW() - INTERVAL '3 days'
       ORDER BY scraped_at DESC LIMIT 500`,
    );
    const postEntries = posts.map(p => {
      const lastmod = p.scraped_at.split('T')[0];
      return urlEntry(`/issue/${p.id}`, 'daily', '0.6', lastmod);
    });

    // 일일 리포트 (최근 30일)
    const { rows: reports } = await app.pg.query<{ report_date: string }>(
      `SELECT report_date FROM daily_reports
       WHERE status = 'published'
       ORDER BY report_date DESC LIMIT 30`,
    );
    const reportEntries = reports.map(r =>
      urlEntry(`/daily-report/${String(r.report_date).slice(0, 10)}`, 'daily', '0.7', r.report_date),
    );

    // 인기 키워드 SEO 랜딩 페이지 (상위 100개)
    const { rows: keywords } = await app.pg.query<{ keyword: string }>(
      `SELECT keyword FROM keyword_stats
       WHERE window_hours = 3
       ORDER BY mention_count DESC LIMIT 100`,
    );
    const keywordEntries = keywords.map(k =>
      urlEntry(`/keyword/${encodeURIComponent(k.keyword)}`, 'hourly', '0.5'),
    );

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...reportEntries, ...postEntries, ...keywordEntries].join('\n')}
</urlset>`;

    return reply
      .type('application/xml; charset=utf-8')
      .header('cache-control', 'public, max-age=3600')
      .send(xml);
  });
}
