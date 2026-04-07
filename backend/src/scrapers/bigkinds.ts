import axios from 'axios';
import type { Pool } from 'pg';
import { TrendSignalScraper } from './trend-base.js';
import type { TrendKeywordInput } from './types.js';
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

export class BigKindsScraper extends TrendSignalScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  protected override getSourceKey(): string { return 'bigkinds_issues'; }

  async fetchTrendKeywords(): Promise<TrendKeywordInput[]> {
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

    return items.slice(0, 10).map((item): TrendKeywordInput => ({
      keyword: item.제목,
      sourceKey: 'bigkinds_issues',
      signalStrength: Math.min(item.건수 / 100, 1.0),
      rankPosition: item.순위,
      metadata: {
        articleCount: item.건수,
        period: item.시기,
        dataDate: item.날짜,
      },
    }));
  }
}
