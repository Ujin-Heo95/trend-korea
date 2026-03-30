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

interface KmdbEnrichment {
  posterUrl?: string;
  director?: string;
  plotSummary?: string;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function extractFirstSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? match[1] : cleaned.slice(0, 100);
}

function stripKmdbTags(text: string): string {
  return text.replace(/!HS|!HE/g, '').trim();
}

async function enrichWithKmdb(movieName: string, openYear?: string): Promise<KmdbEnrichment> {
  if (!config.kmdbApiKey) return {};

  try {
    const params: Record<string, string> = {
      collection: 'kmdb_new2',
      detail: 'Y',
      title: movieName,
      ServiceKey: config.kmdbApiKey,
    };
    if (openYear && openYear.length >= 4) {
      params.releaseDts = openYear.slice(0, 4);
    }

    const { data } = await axios.get(
      'https://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp',
      { params, timeout: 5000 }
    );

    const result = data?.Data?.[0]?.Result?.[0];
    if (!result) return {};

    // 포스터: 파이프 구분 첫 번째
    const posterUrl = result.posters
      ? result.posters.split('|')[0]?.trim() || undefined
      : undefined;

    // 감독
    const directorObj = result.directors?.director?.[0];
    const director = directorObj?.directorNm
      ? stripKmdbTags(directorObj.directorNm)
      : undefined;

    // 줄거리: 한국어 우선, 첫 문장만
    const plots: { plotLang?: string; plotText?: string }[] = result.plots?.plot ?? [];
    const koreanPlot = plots.find(p => p.plotLang === '한국어') ?? plots[0];
    const plotSummary = koreanPlot?.plotText
      ? extractFirstSentence(stripKmdbTags(koreanPlot.plotText))
      : undefined;

    return { posterUrl, director, plotSummary };
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

    // KMDB 영화 검색으로 포스터/줄거리/감독 보강 (p-limit(2), 200ms 딜레이)
    const limit = pLimit(2);
    const enrichments = await Promise.all(
      items.slice(0, 10).map((item, idx) =>
        limit(async () => {
          if (idx > 0) await delay(200);
          return enrichWithKmdb(item.movieNm, item.openDt);
        })
      )
    );

    return items.slice(0, 10).map((item, idx): ScrapedPost => {
      const rankChange = parseInt(item.rankInten, 10);
      const rankLabel = item.rankOldAndNew === 'NEW'
        ? '🆕'
        : rankChange > 0 ? `▲${rankChange}` : rankChange < 0 ? `▼${Math.abs(rankChange)}` : '-';

      const kmdb = enrichments[idx] ?? {};

      return {
        sourceKey: 'kobis_boxoffice',
        sourceName: 'KOBIS 박스오피스',
        title: `${item.rank}위 ${item.movieNm} (${rankLabel}) — 일 ${parseInt(item.audiCnt, 10).toLocaleString()}명`,
        url: `https://www.kobis.or.kr/kobis/business/mast/mvie/searchMovieList.do?movieCd=${item.movieCd}`,
        thumbnail: kmdb.posterUrl ?? undefined,
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
          posterUrl: kmdb.posterUrl,
          director: kmdb.director,
          plotSummary: kmdb.plotSummary,
        },
      };
    });
  }
}
