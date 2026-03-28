import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  dbUrl: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/trend_korea',
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
  crawlIntervalMinutes: Number(process.env.CRAWL_INTERVAL_MINUTES ?? 10),
};
