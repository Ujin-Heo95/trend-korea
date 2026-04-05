import axios from 'axios';
import type { Pool } from 'pg';
import { parseStringPromise } from 'xml2js';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface LivePopulation {
  readonly AREA_NM: readonly string[];
  readonly AREA_CONGEST_LVL: readonly string[];
  readonly AREA_CONGEST_MSG: readonly string[];
  readonly AREA_PPLTN_MIN: readonly string[];
  readonly AREA_PPLTN_MAX: readonly string[];
  readonly PPLTN_TIME: readonly string[];
}

interface CitydataXml {
  readonly 'SeoulRtd.citydata': {
    readonly CITYDATA: readonly {
      readonly AREA_NM: readonly string[];
      readonly LIVE_PPLTN_STTS: readonly {
        readonly LIVE_PPLTN_STTS: readonly LivePopulation[];
      }[];
    }[];
  };
}

const MONITORED_AREAS = [
  '광화문·덕수궁',
  '명동',
  '홍대',
  '강남역',
  '여의도',
  '북촌·삼청동',
  '이태원',
  '잠실',
  '동대문',
  '건대입구',
] as const;

function formatPopulation(n: number): string {
  if (n >= 10000) {
    const man = (n / 10000).toFixed(1).replace(/\.0$/, '');
    return `${man}만`;
  }
  return n.toLocaleString();
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class SeoulCitydataScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.seoulOpenApiKey) {
      logger.warn('[seoul-citydata] SEOUL_OPEN_API_KEY missing — skipping');
      return [];
    }

    const posts: ScrapedPost[] = [];

    for (const area of MONITORED_AREAS) {
      try {
        const encodedArea = encodeURIComponent(area);
        const url = `http://openapi.seoul.go.kr:8088/${config.seoulOpenApiKey}/xml/citydata/1/5/${encodedArea}`;

        const { data: xml } = await axios.get<string>(url, {
          timeout: 10000,
          responseType: 'text',
        });

        const parsed = await parseStringPromise(xml) as CitydataXml;
        const citydata = parsed['SeoulRtd.citydata']?.CITYDATA?.[0];
        if (!citydata) continue;

        const ppltnStts = citydata.LIVE_PPLTN_STTS?.[0]?.LIVE_PPLTN_STTS?.[0];
        if (!ppltnStts) continue;

        const congestion = ppltnStts.AREA_CONGEST_LVL?.[0] ?? '측정중';
        const congestionMsg = ppltnStts.AREA_CONGEST_MSG?.[0] ?? '';
        const ppltnMin = parseInt(ppltnStts.AREA_PPLTN_MIN?.[0] ?? '0');
        const ppltnMax = parseInt(ppltnStts.AREA_PPLTN_MAX?.[0] ?? '0');
        const ppltnTime = ppltnStts.PPLTN_TIME?.[0] ?? '';

        const title = `${area}: ${congestion} (인구 약 ${formatPopulation(ppltnMin)}~${formatPopulation(ppltnMax)}명)`;

        posts.push({
          sourceKey: 'seoul_citydata',
          sourceName: '서울 실시간 도시데이터',
          title,
          url: `https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do`,
          category: 'travel',
          metadata: {
            area,
            congestionLevel: congestion,
            congestionMessage: congestionMsg,
            populationMin: ppltnMin,
            populationMax: ppltnMax,
            measuredAt: ppltnTime,
          },
        });
      } catch (err) {
        logger.warn({ err, area }, '[seoul-citydata] area fetch failed');
      }

      await delay(200);
    }

    return posts;
  }
}
