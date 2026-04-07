import axios from 'axios';
import type { Pool } from 'pg';
import { TrendSignalScraper } from './trend-base.js';
import type { TrendKeywordInput } from './types.js';

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

export class WikipediaKoScraper extends TrendSignalScraper {
  constructor(pool: Pool) { super(pool); }

  protected override getSourceKey(): string { return 'wikipedia_ko'; }

  async fetchTrendKeywords(): Promise<TrendKeywordInput[]> {
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
      .map((a): TrendKeywordInput => ({
        keyword: a.article.replace(/_/g, ' '),
        sourceKey: 'wikipedia_ko',
        signalStrength: Math.min(a.views / 100_000, 1.0),
        rankPosition: a.rank,
        metadata: { views: a.views },
      }));
  }
}
