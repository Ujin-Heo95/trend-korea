import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';

const BASE_URL = 'https://weeklit.net';
const SITE_NAME = '위클릿 — 실시간 트렌드 모아보기';
const DEFAULT_DESC = '위클릿은 한국 주요 커뮤니티, 뉴스, YouTube에서 실시간 이슈를 모아보는 트렌드 어그리게이터입니다';

const BOT_UA_PATTERN = /googlebot|yeti|bingbot|duckduckbot|kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|linkedinbot|telegrambot|whatsapp|line-poker|pinterestbot/i;

function isBot(ua: string | undefined): boolean {
  return ua ? BOT_UA_PATTERN.test(ua) : false;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface PageMeta {
  title: string;
  description: string;
  url: string;
  ogImage?: string;
  type?: string;
  jsonLd?: Record<string, unknown>;
}

function renderHtml(meta: PageMeta): string {
  const title = escapeHtml(meta.title);
  const desc = escapeHtml(meta.description);
  const url = escapeHtml(meta.url);
  const type = meta.type ?? 'website';
  const ogImage = meta.ogImage ? `<meta property="og:image" content="${escapeHtml(meta.ogImage)}" />` : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:type" content="${type}" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="위클릿" />
  ${ogImage}
  <meta name="twitter:card" content="${meta.ogImage ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <link rel="canonical" href="${url}" />
  <meta name="robots" content="index, follow" />
  ${meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>` : ''}
</head>
<body>
  <h1>${title}</h1>
  <p>${desc}</p>
  <a href="${url}">위클릿에서 보기</a>
</body>
</html>`;
}

async function getIssueMeta(pool: Pool, postId: number): Promise<PageMeta | null> {
  const { rows } = await pool.query<{
    title: string;
    source_name: string;
    thumbnail: string | null;
    category: string | null;
    scraped_at: string;
  }>(
    `SELECT title, source_name, thumbnail, category, scraped_at FROM posts WHERE id = $1`,
    [postId],
  );
  if (!rows[0]) return null;
  const { title, source_name, thumbnail, category, scraped_at } = rows[0];
  const desc = `${source_name}${category ? ` · ${category}` : ''} — 위클릿 실시간 이슈`;
  const pageUrl = `${BASE_URL}/issue/${postId}`;
  return {
    title: `${title} — 위클릿`,
    description: desc,
    url: pageUrl,
    ogImage: thumbnail ?? undefined,
    type: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description: desc,
      url: pageUrl,
      datePublished: scraped_at,
      publisher: { '@type': 'Organization', name: '위클릿', url: BASE_URL },
      ...(thumbnail ? { image: thumbnail } : {}),
    },
  };
}

async function getDailyReportMeta(pool: Pool, date: string): Promise<PageMeta | null> {
  const { rows } = await pool.query<{
    report_date: string;
    editorial_briefing: string | null;
  }>(
    `SELECT report_date, editorial_briefing FROM daily_reports WHERE report_date = $1`,
    [date],
  );
  if (!rows[0]) return null;
  const briefing = rows[0].editorial_briefing ?? '오늘의 트렌드 종합 리포트';
  return {
    title: `${rows[0].report_date} 일일 트렌드 리포트 — 위클릿`,
    description: briefing.slice(0, 200),
    url: `${BASE_URL}/daily-report/${date}`,
  };
}

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '위클릿',
  url: BASE_URL,
  description: DEFAULT_DESC,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${BASE_URL}/?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
};

function getStaticMeta(path: string): PageMeta {
  if (path.startsWith('/keywords')) {
    return { title: '이슈 키워드 — 위클릿', description: '실시간 트렌드 키워드 분석', url: `${BASE_URL}/keywords` };
  }
  if (path.startsWith('/about')) {
    return { title: '서비스 소개 — 위클릿', description: '위클릿은 한국 주요 커뮤니티와 뉴스에서 실시간 이슈를 모아보는 트렌드 어그리게이터입니다.', url: `${BASE_URL}/about` };
  }
  if (path.startsWith('/privacy')) {
    return { title: '개인정보처리방침 — 위클릿', description: '위클릿 개인정보처리방침', url: `${BASE_URL}/privacy` };
  }
  if (path.startsWith('/weather')) {
    return { title: '날씨 — 위클릿', description: '전국 주요 도시 날씨 예보', url: `${BASE_URL}/weather` };
  }
  return { title: SITE_NAME, description: DEFAULT_DESC, url: BASE_URL, jsonLd: WEBSITE_JSON_LD };
}

export function registerPrerender(app: FastifyInstance, pool: Pool): void {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // API 요청은 프리렌더 대상 아님
    if (req.url.startsWith('/api/') || req.url.startsWith('/health')) return;

    // 봇이 아니면 패스 (SPA가 처리)
    if (!isBot(req.headers['user-agent'])) return;

    // 정적 자산은 패스
    if (/\.(js|css|png|jpg|svg|ico|webp|json|xml|txt|woff2?)(\?|$)/.test(req.url)) return;

    try {
      let meta: PageMeta | null = null;

      const issueMatch = req.url.match(/^\/issue\/(\d+)/);
      if (issueMatch) {
        meta = await getIssueMeta(pool, Number(issueMatch[1]));
      }

      const reportMatch = req.url.match(/^\/daily-report\/(\d{4}-\d{2}-\d{2})/);
      if (!meta && reportMatch) {
        meta = await getDailyReportMeta(pool, reportMatch[1]);
      }

      if (!meta) {
        meta = getStaticMeta(req.url);
      }

      return reply.type('text/html; charset=utf-8').send(renderHtml(meta));
    } catch (err) {
      // 프리렌더 실패 시 SPA로 폴백
      console.warn(`[prerender] error for ${req.url}: ${String(err)}`);
    }
  });
}
