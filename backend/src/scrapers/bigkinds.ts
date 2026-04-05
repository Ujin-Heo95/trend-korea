import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

const API_URL = 'https://api.odcloud.kr/api/15145668/v1/uddi:e72389aa-4f00-44db-b4c4-d2943131e9ea';

interface BigKindsItem {
  readonly 건수: number;
  readonly 날짜: string;
  readonly 순위: number;
  readonly 시기: string;
  readonly 제목: string;
}

interface BigKindsResponse {
  readonly totalCount: number;
  readonly currentCount: number;
  readonly data: readonly BigKindsItem[];
}

export class BigKindsScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.bigkindsApiKey) {
      throw new Error('BIGKINDS_API_KEY not configured');
    }

    // 1. totalCount 조회 → 마지막 페이지 계산 (API는 날짜 오름차순)
    const { data: first } = await axios.get<BigKindsResponse>(API_URL, {
      params: { serviceKey: config.bigkindsApiKey, page: 1, perPage: 1 },
      timeout: 15000,
    });

    if (!first.totalCount) return [];

    const lastPage = Math.ceil(first.totalCount / 10);

    // 2. 마지막 페이지 조회 (최신 Top 10)
    const { data } = await axios.get<BigKindsResponse>(API_URL, {
      params: { serviceKey: config.bigkindsApiKey, page: lastPage, perPage: 10 },
      timeout: 15000,
    });

    const items = data?.data ?? [];
    if (items.length === 0) return [];

    // 3. 날짜 파싱 (YYYYMMDD 또는 YYYY-MM-DD)
    const parseDate = (raw: string): Date => {
      const cleaned = raw.replace(/-/g, '');
      if (cleaned.length === 8) {
        return new Date(`${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}T00:00:00+09:00`);
      }
      return new Date(raw);
    };

    return items.slice(0, 10).map((item): ScrapedPost => ({
      sourceKey: 'bigkinds_issues',
      sourceName: '빅카인즈 오늘의 이슈',
      title: item.제목,
      url: `https://www.bigkinds.or.kr/v2/news/search.do#newsSearchQuery=${encodeURIComponent(item.제목)}`,
      viewCount: item.건수,
      publishedAt: parseDate(item.날짜),
      category: 'news',
      metadata: {
        rank: item.순위,
        articleCount: item.건수,
        keyword: item.제목,
        period: item.시기,
        dataDate: item.날짜,
      },
    }));
  }
}
