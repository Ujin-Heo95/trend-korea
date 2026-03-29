import 'dotenv/config';

interface Config {
  port: number;
  dbUrl: string;
  youtubeApiKey: string;
  crawlIntervalMinutes: number;
  postTtlDays: number;
  scraperRunsTtlDays: number;
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

export const config: Config = {
  port,
  dbUrl,
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
  crawlIntervalMinutes,
  postTtlDays,
  scraperRunsTtlDays,
};
