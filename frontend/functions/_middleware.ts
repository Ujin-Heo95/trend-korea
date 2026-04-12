/**
 * Cloudflare Pages Middleware — 봇 UA 감지 시 Fly.io 백엔드의 /api/prerender로
 * 프록시하여 사전 렌더링된 HTML을 반환한다.
 *
 * 일반 브라우저 요청은 통과시켜 CF Pages가 SPA(index.html)를 서빙.
 *
 * 배포: CF Pages가 frontend/functions/ 디렉터리를 자동 감지하여 Workers로 빌드.
 * wrangler.toml 없이 동작함.
 */

interface PagesContext {
  readonly request: Request;
  readonly next: () => Promise<Response>;
}

const BOT_UA_PATTERN =
  /googlebot|yeti|bingbot|duckduckbot|kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|linkedinbot|telegrambot|whatsapp|pinterestbot|gptbot|chatgpt-user|claudebot|perplexitybot|google-extended|applebot|cohere-ai/i;

const BACKEND_BASE = 'https://api.weeklit.net';

const STATIC_ASSET_EXT = /\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|json|xml|txt|map)(\?|$)/i;

function isBot(ua: string | null): boolean {
  return ua ? BOT_UA_PATTERN.test(ua) : false;
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, next } = context;
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent');

  // API는 별도 _redirects에서 처리되므로 여기선 미 개입
  if (url.pathname.startsWith('/api/')) return next();

  // 정적 자산은 항상 CF Pages 직접 서빙
  if (STATIC_ASSET_EXT.test(url.pathname)) return next();

  // 일반 브라우저는 SPA로 패스
  if (!isBot(ua)) return next();

  // 봇: Fly.io 백엔드의 /api/prerender로 프록시
  try {
    const prerenderUrl = new URL(`${BACKEND_BASE}/api/prerender`);
    prerenderUrl.searchParams.set('path', url.pathname + url.search);

    const upstream = await fetch(prerenderUrl.toString(), {
      headers: {
        'user-agent': ua ?? 'weeklit-prerender',
        'x-forwarded-for': request.headers.get('cf-connecting-ip') ?? '',
      },
      cf: { cacheTtl: 600, cacheEverything: true },
    });

    if (!upstream.ok) return next();

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=600, s-maxage=600',
        'x-weeklit-prerender': 'true',
      },
    });
  } catch {
    return next();
  }
};
