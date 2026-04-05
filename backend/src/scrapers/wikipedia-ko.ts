import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

interface WikiArticle {
  readonly article: string;
  readonly views: number;
  readonly rank: number;
}

interface WikiResponse {
  readonly items: readonly {
    readonly articles: readonly WikiArticle[];
  }[];
}

// 제외할 시스템/유틸리티 문서
const EXCLUDED_PREFIXES = ['위키백과:', '특수:', '분류:', '틀:', '포털:', '사용자:', '모듈:'];

export class WikipediaKoScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    // 어제 날짜 기준 (당일 데이터는 아직 집계 안 됨)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '/');

    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ko.wikipedia/all-access/${dateStr}`;

    const { data } = await axios.get<WikiResponse>(url, {
      headers: { 'User-Agent': 'WeekLit/1.0 (weeklit.net; contact@weeklit.net)' },
      timeout: 15000,
    });

    const articles = data.items?.[0]?.articles;
    if (!articles?.length) {
      throw new Error('Wikipedia KO: empty response');
    }

    return articles
      .filter(a => !EXCLUDED_PREFIXES.some(p => a.article.startsWith(p)))
      .filter(a => a.article !== '대한민국') // 항상 상위권인 일반 문서 제외
      .slice(0, 30)
      .map((a): ScrapedPost => ({
        sourceKey: 'wikipedia_ko',
        sourceName: '위키백과 인기 문서',
        title: `📊 ${a.rank}위 ${a.article.replace(/_/g, ' ')} (${a.views.toLocaleString()}회)`,
        url: `https://ko.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
        viewCount: a.views,
        publishedAt: yesterday,
        category: 'trend',
        metadata: {
          keyword: a.article.replace(/_/g, ' '),
          rank: a.rank,
          views: a.views,
        },
      }));
  }
}
