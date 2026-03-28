import 'dotenv/config';

interface Config {
  port: number;
  dbUrl: string;
  youtubeApiKey: string;
  crawlIntervalMinutes: number;
  postTtlDays: number;
}

const dbUrl = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/trend_korea';

if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
  console.warn('[config] WARNING: DATABASE_URL not set — using localhost fallback');
}

const rawTtl = Number(process.env.POST_TTL_DAYS ?? 7);
const postTtlDays = Number.isInteger(rawTtl) && rawTtl >= 1 ? rawTtl : 7;
if (postTtlDays !== rawTtl) {
  console.warn(`[config] WARNING: POST_TTL_DAYS="${process.env.POST_TTL_DAYS}" invalid — defaulting to 7`);
}

export const config: Config = {
  port: Number(process.env.PORT ?? 4000),
  dbUrl,
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
  crawlIntervalMinutes: Number(process.env.CRAWL_INTERVAL_MINUTES ?? 10),
  postTtlDays,
};
