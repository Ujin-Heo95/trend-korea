import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

const BASE_URL = config.baseUrl;
const SITE_NAME = config.siteName;
const DEFAULT_DESC = config.siteDescription;

const BOT_UA_PATTERN = /googlebot|yeti|bingbot|duckduckbot|kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|linkedinbot|telegrambot|whatsapp|line-poker|pinterestbot/i;

const GOOGLE_VERIFICATION = config.googleSiteVerification;
const NAVER_VERIFICATION = config.naverSiteVerification;

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
  jsonLd?: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>;
}

function renderJsonLd(jsonLd: PageMeta['jsonLd']): string {
  if (!jsonLd) return '';
  const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
  return items
    .map(item => `<script type="application/ld+json">${JSON.stringify(item)}</script>`)
    .join('\n  ');
}

function renderHtml(meta: PageMeta): string {
  const title = escapeHtml(meta.title);
  const desc = escapeHtml(meta.description);
  const url = escapeHtml(meta.url);
  const type = meta.type ?? 'website';
  const hasImage = !!meta.ogImage;
  const escapedImage = hasImage ? escapeHtml(meta.ogImage!) : '';

  const verificationTags = [
    GOOGLE_VERIFICATION ? `<meta name="google-site-verification" content="${escapeHtml(GOOGLE_VERIFICATION)}" />` : '',
    NAVER_VERIFICATION ? `<meta name="naver-site-verification" content="${escapeHtml(NAVER_VERIFICATION)}" />` : '',
  ].filter(Boolean).join('\n  ');

  const imageTags = hasImage
    ? `<meta property="og:image" content="${escapedImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:image" content="${escapedImage}" />`
    : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  ${verificationTags}
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:type" content="${type}" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="위클릿" />
  ${imageTags}
  <meta name="twitter:card" content="${hasImage ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <link rel="canonical" href="${url}" />
  <meta name="robots" content="index, follow" />
  ${renderJsonLd(meta.jsonLd)}
</head>
<body>
  <h1>${title}</h1>
  <p>${desc}</p>
  <a href="${url}">위클릿에서 보기</a>
</body>
</html>`;
}

// ── BreadcrumbList 헬퍼 ──

function breadcrumb(items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

const HOME_CRUMB = { name: '위클릿', url: BASE_URL };

const CATEGORY_LABELS: Record<string, string> = {
  community: '커뮤니티', news: '뉴스', tech: '테크', video: 'YouTube',
  portal: '포털', trend: '트렌드', government: '정부', deals: '핫딜',
  sports: '스포츠', movie: '영화', performance: '공연/전시',
  newsletter: '뉴스레터', techblog: '테크블로그', alert: '속보',
};

// ── 페이지별 메타데이터 ──

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
  const categoryLabel = category ? (CATEGORY_LABELS[category] ?? category) : '이슈';

  return {
    title: `${title} — 위클릿`,
    description: desc,
    url: pageUrl,
    ogImage: thumbnail ?? `${BASE_URL}/api/og-image/${postId}`,
    type: 'article',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        description: desc,
        url: pageUrl,
        datePublished: scraped_at,
        publisher: { '@type': 'Organization', name: '위클릿', url: BASE_URL },
        ...(thumbnail ? { image: thumbnail } : {}),
      },
      breadcrumb([
        HOME_CRUMB,
        { name: categoryLabel, url: `${BASE_URL}/?category=${category ?? 'community'}` },
        { name: title, url: pageUrl },
      ]),
    ],
  };
}

async function getDailyReportMeta(pool: Pool, date: string): Promise<PageMeta | null> {
  const { rows } = await pool.query<{
    report_date: string;
    editorial_briefing: string | null;
    editorial_keywords: string | null;
  }>(
    `SELECT report_date, editorial_briefing, editorial_keywords FROM daily_reports WHERE report_date = $1`,
    [date],
  );
  if (!rows[0]) return null;
  const { report_date, editorial_briefing, editorial_keywords } = rows[0];
  const briefing = editorial_briefing ?? '오늘의 트렌드 종합 리포트';
  const pageUrl = `${BASE_URL}/daily-report/${date}`;

  return {
    title: `${report_date} 일일 트렌드 리포트 — 위클릿`,
    description: briefing.slice(0, 200),
    url: pageUrl,
    type: 'article',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: `${report_date} 한국 인터넷 트렌드 리포트`,
        description: briefing.slice(0, 200),
        url: pageUrl,
        datePublished: `${report_date}T09:00:00+09:00`,
        publisher: { '@type': 'Organization', name: '위클릿', url: BASE_URL },
        ...(editorial_keywords ? { keywords: editorial_keywords } : {}),
      },
      breadcrumb([
        HOME_CRUMB,
        { name: '일일 리포트', url: `${BASE_URL}/daily-report` },
        { name: `${report_date} 리포트`, url: pageUrl },
      ]),
    ],
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

const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: '위클릿',
  url: BASE_URL,
  description: DEFAULT_DESC,
};

function getStaticMeta(path: string): PageMeta {
  if (path.startsWith('/keywords')) {
    return {
      title: '이슈 키워드 — 위클릿',
      description: '실시간 트렌드 키워드 분석',
      url: `${BASE_URL}/keywords`,
      jsonLd: breadcrumb([HOME_CRUMB, { name: '이슈 키워드', url: `${BASE_URL}/keywords` }]),
    };
  }
  if (path.startsWith('/about')) {
    return {
      title: '서비스 소개 — 위클릿',
      description: '위클릿은 한국 주요 커뮤니티와 뉴스에서 실시간 이슈를 모아보는 트렌드 어그리게이터입니다.',
      url: `${BASE_URL}/about`,
      jsonLd: breadcrumb([HOME_CRUMB, { name: '서비스 소개', url: `${BASE_URL}/about` }]),
    };
  }
  if (path.startsWith('/privacy')) {
    return {
      title: '개인정보처리방침 — 위클릿',
      description: '위클릿 개인정보처리방침',
      url: `${BASE_URL}/privacy`,
      jsonLd: breadcrumb([HOME_CRUMB, { name: '개인정보처리방침', url: `${BASE_URL}/privacy` }]),
    };
  }
  if (path.startsWith('/weather')) {
    return {
      title: '날씨 — 위클릿',
      description: '전국 주요 도시 날씨 예보',
      url: `${BASE_URL}/weather`,
      jsonLd: breadcrumb([HOME_CRUMB, { name: '날씨', url: `${BASE_URL}/weather` }]),
    };
  }
  // 홈페이지: WebSite + Organization + BreadcrumbList
  return {
    title: SITE_NAME,
    description: DEFAULT_DESC,
    url: BASE_URL,
    jsonLd: [
      WEBSITE_JSON_LD,
      ORGANIZATION_JSON_LD,
      breadcrumb([HOME_CRUMB]),
    ],
  };
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

      const kwMatch = req.url.match(/^\/keyword\/([^/?]+)/);
      if (!meta && kwMatch) {
        const kw = decodeURIComponent(kwMatch[1]);
        const pageUrl = `${BASE_URL}/keyword/${encodeURIComponent(kw)}`;
        meta = {
          title: `"${kw}" 실시간 이슈 — 위클릿`,
          description: `"${kw}" 관련 최신 뉴스, 커뮤니티 반응, 트렌드를 한눈에 모아보세요.`,
          url: pageUrl,
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `${kw} 관련 이슈`,
              url: pageUrl,
              description: `${kw} 관련 최신 이슈 모아보기`,
            },
            breadcrumb([
              HOME_CRUMB,
              { name: '이슈 키워드', url: `${BASE_URL}/keywords` },
              { name: kw, url: pageUrl },
            ]),
          ],
        };
      }

      if (!meta) {
        meta = getStaticMeta(req.url);
      }

      return reply.type('text/html; charset=utf-8').send(renderHtml(meta));
    } catch (err) {
      // 프리렌더 실패 시 SPA로 폴백
      logger.warn({ err, url: req.url }, '[prerender] render error');
    }
  });
}
