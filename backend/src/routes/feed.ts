import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

const BASE_URL = config.baseUrl;
const SITE_NAME = config.siteName;
const SITE_DESC = config.siteDescription;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * RSS 2.0 피드 — 네이버 서치어드바이저 + 구글 뉴스에 제출 가능.
 * 최근 3일 인기 이슈 최대 50개 반환.
 */
export async function feedRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/feed/rss', async (_req, reply) => {
    const { rows } = await app.pg.query<{
      id: number;
      title: string;
      source_name: string;
      category: string | null;
      thumbnail: string | null;
      scraped_at: string;
      url: string;
    }>(
      `SELECT p.id, p.title, p.source_name, p.category, p.thumbnail, p.scraped_at, p.url
       FROM posts p
       LEFT JOIN post_scores ps ON ps.post_id = p.id
       WHERE p.scraped_at > NOW() - INTERVAL '3 days'
       ORDER BY COALESCE(ps.score, 0) DESC, p.scraped_at DESC
       LIMIT 50`,
    );

    const now = new Date().toUTCString();
    const items = rows.map(row => {
      const pubDate = new Date(row.scraped_at).toUTCString();
      const issueUrl = `${BASE_URL}/issue/${row.id}`;
      const categoryTag = row.category
        ? `<category>${escapeXml(row.category)}</category>`
        : '';
      const imageTag = row.thumbnail
        ? `<enclosure url="${escapeXml(row.thumbnail)}" type="image/jpeg" length="0" />`
        : '';

      return `    <item>
      <title>${escapeXml(row.title)}</title>
      <link>${escapeXml(issueUrl)}</link>
      <guid isPermaLink="true">${escapeXml(issueUrl)}</guid>
      <description>${escapeXml(`${row.source_name} — ${row.title}`)}</description>
      <pubDate>${pubDate}</pubDate>
      ${categoryTag}
      ${imageTag}
    </item>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${BASE_URL}</link>
    <description>${escapeXml(SITE_DESC)}</description>
    <language>ko</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${BASE_URL}/api/feed/rss" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>`;

    return reply
      .type('application/rss+xml; charset=utf-8')
      .header('cache-control', 'public, max-age=1800')
      .send(xml);
  });
}
