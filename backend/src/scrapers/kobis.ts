import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

interface DailyBoxOfficeItem {
  readonly rank: string;
  readonly movieNm: string;
  readonly openDt: string;
  readonly audiCnt: string;
  readonly audiAcc: string;
  readonly rankInten: string;
  readonly rankOldAndNew: 'NEW' | 'OLD';
  readonly movieCd: string;
}

interface KobisBoxOfficeResponse {
  readonly boxOfficeResult: {
    readonly boxofficeType: string;
    readonly showRange: string;
    readonly dailyBoxOfficeList: readonly DailyBoxOfficeItem[];
  };
}

export class KobisBoxofficeScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.kobisApiKey) return [];

    // KOBIS는 전일 데이터만 제공 (당일은 미집계)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDt = yesterday.toISOString().slice(0, 10).replace(/-/g, '');

    const { data } = await axios.get<KobisBoxOfficeResponse>(
      'https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json',
      {
        params: {
          key: config.kobisApiKey,
          targetDt,
        },
        timeout: 15000,
      }
    );

    const items = data?.boxOfficeResult?.dailyBoxOfficeList;
    if (!items?.length) return [];

    return items.slice(0, 10).map((item): ScrapedPost => {
      const rankChange = parseInt(item.rankInten, 10);
      const rankLabel = item.rankOldAndNew === 'NEW'
        ? '🆕'
        : rankChange > 0 ? `▲${rankChange}` : rankChange < 0 ? `▼${Math.abs(rankChange)}` : '-';

      return {
        sourceKey: 'kobis_boxoffice',
        sourceName: 'KOBIS 박스오피스',
        title: `${item.rank}위 ${item.movieNm} (${rankLabel}) — 일 ${parseInt(item.audiCnt, 10).toLocaleString()}명`,
        url: `https://www.kobis.or.kr/kobis/business/mast/mvie/searchMovieList.do?movieCd=${item.movieCd}`,
        author: `누적 ${parseInt(item.audiAcc, 10).toLocaleString()}명`,
        viewCount: parseInt(item.audiAcc, 10),
        commentCount: parseInt(item.audiCnt, 10),
        publishedAt: yesterday,
        category: 'movie',
        metadata: {
          rank: parseInt(item.rank, 10),
          movieName: item.movieNm,
          openDate: item.openDt,
          dailyAudience: parseInt(item.audiCnt, 10),
          accumulatedAudience: parseInt(item.audiAcc, 10),
          rankChange,
          isNew: item.rankOldAndNew === 'NEW',
        },
      };
    });
  }
}
