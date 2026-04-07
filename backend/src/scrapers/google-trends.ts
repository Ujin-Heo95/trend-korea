import axios from 'axios';
import type { Pool } from 'pg';
import { TrendSignalScraper } from './trend-base.js';
import type { TrendKeywordInput } from './types.js';

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

export class GoogleTrendsScraper extends TrendSignalScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  protected override getSourceKey(): string { return 'google_trends'; }

  async fetchTrendKeywords(): Promise<TrendKeywordInput[]> {
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

      return searches.slice(0, 30).map((s, idx): TrendKeywordInput => {
        const query = s.title.query;
        const trafficNum = parseTraffic(s.formattedTraffic);

        return {
          keyword: query,
          sourceKey: 'google_trends',
          signalStrength: Math.min(trafficNum / 100_000, 1.0),
          rankPosition: idx + 1,
          metadata: {
            traffic: s.formattedTraffic,
            trafficNum,
            articles: s.articles.slice(0, 5).map(a => ({
              title: a.title,
              url: a.url,
              source: a.source,
            })),
          },
        };
      });
    } catch {
      return [];
    }
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
