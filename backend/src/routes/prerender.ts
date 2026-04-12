import type { FastifyInstance } from 'fastify';
import {
  getIssueMeta,
  getDailyReportMeta,
  getStaticMeta,
  getPathMeta,
  renderHtml,
} from '../middleware/prerender.js';

/**
 * GET /api/prerender?path=/issue/123
 * Cloudflare Worker에서 봇 요청 시 호출하여 OG 메타 HTML을 반환한다.
 */
export async function prerenderRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { path?: string } }>('/api/prerender', async (req, reply) => {
    const pagePath = req.query.path;
    if (!pagePath) {
      return reply.status(400).send({ error: 'path query parameter is required' });
    }

    const pool = app.pg;
    let meta = null;

    const issueMatch = pagePath.match(/^\/issue\/(\d+)/);
    if (issueMatch) {
      meta = await getIssueMeta(pool, Number(issueMatch[1]));
    }

    const reportMatch = pagePath.match(/^\/daily-report\/(\d{4}-\d{2}-\d{2})/);
    if (!meta && reportMatch) {
      meta = await getDailyReportMeta(pool, reportMatch[1]);
    }

    if (!meta) {
      meta = await getPathMeta(pool, pagePath.split('?')[0]);
    }

    const kwMatch = pagePath.match(/^\/keyword\/([^/?]+)/);
    if (!meta && kwMatch) {
      const kw = decodeURIComponent(kwMatch[1]);
      const baseUrl = app.pg ? req.protocol + '://' + req.hostname : 'https://weeklit.net';
      const pageUrl = `${baseUrl}/keyword/${encodeURIComponent(kw)}`;
      meta = {
        title: `"${kw}" 실시간 이슈 — 위클릿`,
        description: `"${kw}" 관련 최신 뉴스, 커뮤니티 반응, 트렌드를 한눈에 모아보세요.`,
        url: pageUrl,
      };
    }

    if (!meta) {
      meta = getStaticMeta(pagePath);
    }

    return reply.type('text/html; charset=utf-8').send(renderHtml(meta));
  });
}
