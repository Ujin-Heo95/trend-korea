import axios from 'axios';
import pLimit from 'p-limit';
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

interface NaverMovieItem {
  readonly title: string;
  readonly link: string;
  readonly image: string;
  readonly director: string;
  readonly actor: string;
  readonly userRating: string;
}

interface NaverMovieResponse {
  readonly items?: readonly NaverMovieItem[];
}

interface NaverEnrichment {
  posterUrl?: string;
  naverMovieUrl?: string;
  director?: string;
  userRating?: number;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function enrichWithNaver(movieName: string): Promise<NaverEnrichment> {
  if (!config.naverClientId || !config.naverClientSecret) return {};

  try {
    const { data } = await axios.get<NaverMovieResponse>(
      'https://openapi.naver.com/v1/search/movie.json',
      {
        params: { query: movieName, display: 1 },
        headers: {
          'X-Naver-Client-Id': config.naverClientId,
          'X-Naver-Client-Secret': config.naverClientSecret,
        },
        timeout: 5000,
      }
    );

    const item = data?.items?.[0];
    if (!item) return {};

    const director = item.director
      .replace(/\|$/g, '')
      .split('|')[0]
      ?.trim() || undefined;

    const rating = parseFloat(item.userRating);

    return {
      posterUrl: item.image || undefined,
      naverMovieUrl: item.link || undefined,
      director,
      userRating: rating > 0 ? rating : undefined,
    };
  } catch {
    return {};
  }
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

    // 네이버 영화 검색으로 포스터/링크 보강 (p-limit(2), 200ms 딜레이)
    const limit = pLimit(2);
    const enrichments = await Promise.all(
      items.slice(0, 10).map((item, idx) =>
        limit(async () => {
          if (idx > 0) await delay(200);
          return enrichWithNaver(item.movieNm);
        })
      )
    );

    return items.slice(0, 10).map((item, idx): ScrapedPost => {
      const rankChange = parseInt(item.rankInten, 10);
      const rankLabel = item.rankOldAndNew === 'NEW'
        ? '🆕'
        : rankChange > 0 ? `▲${rankChange}` : rankChange < 0 ? `▼${Math.abs(rankChange)}` : '-';

      const naver = enrichments[idx] ?? {};

      return {
        sourceKey: 'kobis_boxoffice',
        sourceName: 'KOBIS 박스오피스',
        title: `${item.rank}위 ${item.movieNm} (${rankLabel}) — 일 ${parseInt(item.audiCnt, 10).toLocaleString()}명`,
        url: `https://www.kobis.or.kr/kobis/business/mast/mvie/searchMovieList.do?movieCd=${item.movieCd}`,
        thumbnail: naver.posterUrl ?? undefined,
        author: `누적 ${parseInt(item.audiAcc, 10).toLocaleString()}명`,
        viewCount: parseInt(item.audiAcc, 10),
        commentCount: parseInt(item.audiCnt, 10),
        publishedAt: yesterday,
        category: 'movie',
        metadata: {
          rank: parseInt(item.rank, 10),
          movieName: item.movieNm,
          movieCd: item.movieCd,
          openDate: item.openDt,
          dailyAudience: parseInt(item.audiCnt, 10),
          accumulatedAudience: parseInt(item.audiAcc, 10),
          rankChange,
          isNew: item.rankOldAndNew === 'NEW',
          dataDate: targetDt,
          posterUrl: naver.posterUrl,
          naverMovieUrl: naver.naverMovieUrl,
          director: naver.director,
          userRating: naver.userRating,
        },
      };
    });
  }
}
