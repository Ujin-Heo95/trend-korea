import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

interface TrendArticle {
  title: string;
  url: string;
  source: string;
}

interface TrendingSearch {
  title: { query: string };
  formattedTraffic: string;
  articles: TrendArticle[];
  image?: { imageUrl?: string };
}

interface TrendsResponse {
  default: {
    trendingSearchesDays: {
      date: string;
      trendingSearches: TrendingSearch[];
    }[];
  };
}

export class GoogleTrendsScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    try {
      const { data } = await axios.get<TrendsResponse>(
        'https://trends.google.com/trends/trendingsearches/daily',
        {
          params: { geo: 'KR', hl: 'ko' },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
          timeout: 10000,
        },
      );

      const days = data?.default?.trendingSearchesDays ?? [];
      const searches = days.flatMap(d => d.trendingSearches);

      return searches.slice(0, 30).map(s => this.toPost(s));
    } catch {
      return [];
    }
  }

  private toPost(s: TrendingSearch): ScrapedPost {
    const query = s.title.query;
    const article = s.articles[0];
    const url = article?.url
      ?? `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    return {
      sourceKey: 'google_trends',
      sourceName: 'Google 트렌드',
      title: `${query} — ${s.formattedTraffic} 검색`,
      url,
      thumbnail: s.image?.imageUrl,
      author: article?.source,
      category: 'trend',
      metadata: {
        keyword: query,
        traffic: s.formattedTraffic,
        trafficNum: parseTraffic(s.formattedTraffic),
        articles: s.articles.slice(0, 5).map(a => ({
          title: a.title,
          url: a.url,
          source: a.source,
        })),
      },
    };
  }
}

function parseTraffic(traffic: string): number {
  const cleaned = traffic.replace(/[^0-9KkMm+,]/g, '').replace(/,/g, '');
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) return 0;
  if (/[Kk]/.test(traffic)) return num * 1000;
  if (/[Mm]/.test(traffic)) return num * 1000000;
  return num;
}
