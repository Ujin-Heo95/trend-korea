import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { TrendSignalScraper } from './trend-base.js';
import type { TrendKeywordInput } from './types.js';

/**
 * Google Trends 한국 일간 검색 트렌드.
 * RSS feed: https://trends.google.com/trending/rss?geo=KR
 * (이전 JSON endpoint /trends/trendingsearches/daily 는 2025년 deprecate)
 */
export class GoogleTrendsScraper extends TrendSignalScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  protected override getSourceKey(): string { return 'google_trends'; }

  async fetchTrendKeywords(): Promise<TrendKeywordInput[]> {
    const { data } = await axios.get<string>(
      'https://trends.google.com/trending/rss?geo=KR',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*;q=0.1',
        },
        timeout: 15_000,
        responseType: 'text',
      },
    );

    const $ = cheerio.load(data, { xml: true });
    const keywords: TrendKeywordInput[] = [];

    $('item').each((idx, el) => {
      if (idx >= 30) return;

      const $el = $(el);
      const query = $el.find('title').text().trim();
      if (!query) return;

      const trafficText = $el.find('ht\\:approx_traffic').text().trim();
      const trafficNum = parseTraffic(trafficText);

      // 관련 뉴스 기사 수집
      const articles: { title: string; url: string; source: string }[] = [];
      $el.find('ht\\:news_item').each((_, newsEl) => {
        const $news = $(newsEl);
        articles.push({
          title: $news.find('ht\\:news_item_title').text().trim(),
          url: $news.find('ht\\:news_item_url').text().trim(),
          source: $news.find('ht\\:news_item_source').text().trim(),
        });
      });

      const picture = $el.find('ht\\:picture').text().trim() || undefined;

      keywords.push({
        keyword: query,
        sourceKey: 'google_trends',
        signalStrength: Math.min(trafficNum / 100_000, 1.0),
        rankPosition: idx + 1,
        metadata: {
          traffic: trafficText,
          trafficNum,
          picture,
          articles: articles.slice(0, 5),
        },
      });
    });

    return keywords;
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
