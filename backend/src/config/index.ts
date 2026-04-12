import 'dotenv/config';

interface Config {
  port: number;
  dbUrl: string;
  youtubeApiKey: string;
  kopisApiKey: string;
  kobisApiKey: string;
  kmdbApiKey: string;
  kmaApiKey: string;
  kakaoRestApiKey: string;
  naverClientId: string;
  naverClientSecret: string;
  discordWebhookUrl: string;
  sentryDsn: string;
  crawlIntervalMinutes: number;
  postTtlDays: number;
  scraperRunsTtlDays: number;
  dbPoolMax: number;
  dbIdleTimeoutMs: number;
  dbConnectionTimeoutMs: number;
  apifyApiToken: string;
  apifyMonthlyBudgetCents: number;
  bigkindsApiKey: string;
  geminiApiKey: string;
  dataGoKrApiKey: string;
  kcisaTravelApiKey: string;
  kcisaFestivalApiKey: string;
  kcisaEventApiKey: string;
  kcisaPerformanceApiKey: string;
  kcisaExhibitionApiKey: string;
  culturePerformanceApiKey: string;
  seoulOpenApiKey: string;
  adminToken: string;
  corsOrigin: string[];
  nodeEnv: string;
  baseUrl: string;
  siteName: string;
  siteDescription: string;
  googleSiteVerification: string;
  naverSiteVerification: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseJwtSecret: string;
  backupEnabled: boolean;
  backupRetentionDays: number;
  serveFrontend: boolean;
}

const dbUrl = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/trend_korea';

if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
  console.warn('[config] WARNING: DATABASE_URL not set — using localhost fallback');
}

const rawPort = Number(process.env.PORT ?? 4000);
const port = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 4000;
if (port !== rawPort) {
  console.warn(`[config] WARNING: PORT="${process.env.PORT}" invalid — defaulting to 4000`);
}

const rawInterval = Number(process.env.CRAWL_INTERVAL_MINUTES ?? 10);
const crawlIntervalMinutes = Number.isInteger(rawInterval) && rawInterval >= 1 ? rawInterval : 10;
if (crawlIntervalMinutes !== rawInterval) {
  console.warn(`[config] WARNING: CRAWL_INTERVAL_MINUTES="${process.env.CRAWL_INTERVAL_MINUTES}" invalid — defaulting to 10`);
}

const rawTtl = Number(process.env.POST_TTL_DAYS ?? 7);
const postTtlDays = Number.isInteger(rawTtl) && rawTtl >= 1 ? rawTtl : 7;
if (postTtlDays !== rawTtl) {
  console.warn(`[config] WARNING: POST_TTL_DAYS="${process.env.POST_TTL_DAYS}" invalid — defaulting to 7`);
}

const rawScraperRunsTtl = Number(process.env.SCRAPER_RUNS_TTL_DAYS ?? 30);
const scraperRunsTtlDays = Number.isInteger(rawScraperRunsTtl) && rawScraperRunsTtl >= 1 ? rawScraperRunsTtl : 30;
if (scraperRunsTtlDays !== rawScraperRunsTtl) {
  console.warn(`[config] WARNING: SCRAPER_RUNS_TTL_DAYS="${process.env.SCRAPER_RUNS_TTL_DAYS}" invalid — defaulting to 30`);
}

const rawApifyBudget = Number(process.env.APIFY_MONTHLY_BUDGET_CENTS ?? 2000);
const apifyMonthlyBudgetCents = Number.isInteger(rawApifyBudget) && rawApifyBudget >= 0 ? rawApifyBudget : 2000;
if (apifyMonthlyBudgetCents !== rawApifyBudget) {
  console.warn(`[config] WARNING: APIFY_MONTHLY_BUDGET_CENTS="${process.env.APIFY_MONTHLY_BUDGET_CENTS}" invalid — defaulting to 2000`);
}

// Supabase Pro pooler(:6543) 는 ~100 pooled connection 허용.
// 25 로 상향해 burst(Promise.all 8+) 시에도 waiter queue 발생 최소화.
const dbPoolMax = Math.min(Math.max(Number(process.env.DB_POOL_MAX ?? 25) || 25, 1), 50);
const dbIdleTimeoutMs = Number(process.env.DB_IDLE_TIMEOUT_MS ?? 20000) || 20000;
const dbConnectionTimeoutMs = Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 10000) || 10000;

export const config: Config = {
  port,
  dbUrl,
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
  kopisApiKey: process.env.KOPIS_API_KEY ?? '',
  kobisApiKey: process.env.KOBIS_API_KEY ?? '',
  kmdbApiKey: process.env.KMDB_API_KEY ?? '',
  kmaApiKey: process.env.KMA_API_KEY ?? '',
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY ?? '',
  naverClientId: process.env.NAVER_CLIENT_ID ?? '',
  naverClientSecret: process.env.NAVER_CLIENT_SECRET ?? '',
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? '',
  sentryDsn: process.env.SENTRY_DSN ?? '',
  crawlIntervalMinutes,
  postTtlDays,
  scraperRunsTtlDays,
  dbPoolMax,
  dbIdleTimeoutMs,
  dbConnectionTimeoutMs,
  apifyApiToken: process.env.APIFY_API_TOKEN ?? '',
  apifyMonthlyBudgetCents,
  bigkindsApiKey: process.env.BIGKINDS_API_KEY ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  dataGoKrApiKey: process.env.DATA_GO_KR_API_KEY ?? '',
  kcisaTravelApiKey: process.env.KCISA_TRAVEL_API_KEY ?? '',
  kcisaFestivalApiKey: process.env.KCISA_FESTIVAL_API_KEY ?? '',
  kcisaEventApiKey: process.env.KCISA_EVENT_API_KEY ?? '',
  kcisaPerformanceApiKey: process.env.KCISA_PERFORMANCE_API_KEY ?? '',
  kcisaExhibitionApiKey: process.env.KCISA_EXHIBITION_API_KEY ?? '',
  culturePerformanceApiKey: process.env.CULTURE_PERFORMANCE_API_KEY ?? '',
  seoulOpenApiKey: process.env.SEOUL_OPEN_API_KEY ?? '',
  adminToken: process.env.ADMIN_TOKEN ?? (() => {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[config] WARNING: ADMIN_TOKEN is not set — admin endpoints are disabled in production');
    }
    return '';
  })(),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'https://weeklit.net,https://www.weeklit.net')
    .split(',').map(s => s.trim()),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  baseUrl: process.env.BASE_URL ?? 'https://weeklit.net',
  siteName: process.env.SITE_NAME ?? '위클릿 — 실시간 트렌드 모아보기',
  siteDescription: process.env.SITE_DESCRIPTION ?? '위클릿은 한국 주요 커뮤니티, 뉴스, YouTube에서 실시간 이슈를 모아보는 트렌드 어그리게이터입니다',
  googleSiteVerification: process.env.GOOGLE_SITE_VERIFICATION ?? '',
  naverSiteVerification: process.env.NAVER_SITE_VERIFICATION ?? '',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
  backupEnabled: process.env.BACKUP_ENABLED !== 'false',
  backupRetentionDays: (() => {
    const v = Number(process.env.BACKUP_RETENTION_DAYS ?? 7);
    return Number.isInteger(v) && v >= 1 ? v : 7;
  })(),
  serveFrontend: process.env.SERVE_FRONTEND !== 'false',
};
