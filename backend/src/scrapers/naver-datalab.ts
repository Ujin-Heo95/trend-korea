import axios from 'axios';
import type { Pool } from 'pg';
import { TrendSignalScraper } from './trend-base.js';
import type { TrendKeywordInput } from './types.js';
import { config } from '../config/index.js';

interface KeywordGroup {
  readonly groupName: string;
  readonly keywords: readonly string[];
}

interface DatalabRatio {
  readonly period: string;
  readonly ratio: number;
}

interface DatalabResult {
  readonly title: string;
  readonly keywords: readonly string[];
  readonly data: readonly DatalabRatio[];
}

interface DatalabResponse {
  readonly startDate: string;
  readonly endDate: string;
  readonly timeUnit: string;
  readonly results: readonly DatalabResult[];
}

// 한국 주요 트렌드 키워드 (5개 그룹 × 배치)
const KEYWORD_BATCHES: readonly (readonly KeywordGroup[])[] = [
  [
    { groupName: '부동산', keywords: ['부동산', '아파트 매매', '전세', '청약'] },
    { groupName: '주식투자', keywords: ['주식', '코스피', '코스닥', '테마주'] },
    { groupName: '취업채용', keywords: ['취업', '채용', '공채', '자소서'] },
    { groupName: 'AI기술', keywords: ['AI', '인공지능', 'ChatGPT', '딥러닝'] },
    { groupName: '여행', keywords: ['여행', '항공권', '호텔', '해외여행'] },
  ],
  [
    { groupName: '다이어트', keywords: ['다이어트', '헬스', '운동', '식단'] },
    { groupName: '육아교육', keywords: ['육아', '교육', '입시', '학원'] },
    { groupName: '맛집', keywords: ['맛집', '카페', '배달', '레시피'] },
    { groupName: '게임', keywords: ['게임', '신작게임', '스팀', 'PS5'] },
    { groupName: '연예', keywords: ['아이돌', '드라마', '영화', 'K-POP'] },
  ],
];

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeTrend(data: readonly DatalabRatio[]): { recent: number; previous: number; changePercent: number } {
  if (data.length < 4) return { recent: 0, previous: 0, changePercent: 0 };

  const recentDays = data.slice(-3);
  const previousDays = data.slice(-7, -3);

  const recent = recentDays.reduce((sum, d) => sum + d.ratio, 0) / recentDays.length;
  const previous = previousDays.length > 0
    ? previousDays.reduce((sum, d) => sum + d.ratio, 0) / previousDays.length
    : 0;

  const changePercent = previous > 0 ? ((recent - previous) / previous) * 100 : 0;

  return { recent: Math.round(recent), previous: Math.round(previous), changePercent: Math.round(changePercent) };
}

export class NaverDatalabScraper extends TrendSignalScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  protected override getSourceKey(): string { return 'naver_datalab'; }

  async fetchTrendKeywords(): Promise<TrendKeywordInput[]> {
    if (!config.naverClientId || !config.naverClientSecret) {
      throw new Error('NAVER_CLIENT_ID or NAVER_CLIENT_SECRET not configured');
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const allResults: TrendKeywordInput[] = [];

    for (const batch of KEYWORD_BATCHES) {
      const results = await this.fetchBatch(batch, startDate, endDate);
      allResults.push(...results);
    }

    // 변화율 절대값 기준 내림차순 (가장 큰 변화가 먼저)
    return allResults
      .sort((a, b) => Math.abs(b.signalStrength) - Math.abs(a.signalStrength))
      .slice(0, 10);
  }

  private async fetchBatch(
    keywordGroups: readonly KeywordGroup[],
    startDate: Date,
    endDate: Date,
  ): Promise<TrendKeywordInput[]> {
    const { data } = await axios.post<DatalabResponse>(
      'https://openapi.naver.com/v1/datalab/search',
      {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        timeUnit: 'date',
        keywordGroups: keywordGroups.map(g => ({
          groupName: g.groupName,
          keywords: [...g.keywords],
        })),
      },
      {
        headers: {
          'X-Naver-Client-Id': config.naverClientId,
          'X-Naver-Client-Secret': config.naverClientSecret,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );

    if (!data?.results?.length) return [];

    return data.results.map((result): TrendKeywordInput => {
      const { recent, previous, changePercent } = computeTrend(result.data);

      // 각 키워드를 개별 엔트리로 (그룹 대표 키워드)
      return {
        keyword: result.title,
        sourceKey: 'naver_datalab',
        signalStrength: Math.min(Math.max(changePercent, 0) / 100, 1.0),
        metadata: {
          groupName: result.title,
          keywords: [...result.keywords],
          changePct: changePercent,
          recentRatio: recent,
          previousRatio: previous,
        },
      };
    });
  }
}
