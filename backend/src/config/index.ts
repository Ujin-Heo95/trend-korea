import 'dotenv/config';

interface Config {
  port: number;
  dbUrl: string;
  youtubeApiKey: string;
  geminiApiKey: string;
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

const rawTtl = Number(process.env.POST_TTL_DAYS ?? 3);
const postTtlDays = Number.isInteger(rawTtl) && rawTtl >= 1 ? rawTtl : 3;
if (postTtlDays !== rawTtl) {
  console.warn(`[config] WARNING: POST_TTL_DAYS="${process.env.POST_TTL_DAYS}" invalid — defaulting to 3`);
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

const dbPoolMax = Math.min(Math.max(Number(process.env.DB_POOL_MAX ?? 10) || 10, 1), 50);
const dbIdleTimeoutMs = Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000) || 30000;
const dbConnectionTimeoutMs = Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000) || 5000;

export const config: Config = {
  port,
  dbUrl,
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
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
};
