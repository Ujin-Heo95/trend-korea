import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

interface AirQualityItem {
  readonly stationName: string;
  readonly sidoName: string;
  readonly pm10Value: string;
  readonly pm25Value: string;
  readonly khaiValue: string;
  readonly khaiGrade: string;
  readonly dataTime: string;
}

interface AirKoreaResponse {
  readonly response: {
    readonly header: { readonly resultCode: string; readonly resultMsg: string };
    readonly body: {
      readonly items: readonly AirQualityItem[];
      readonly totalCount: number;
    };
  };
}

const GRADE_LABELS: Record<string, string> = {
  '1': '좋음', '2': '보통', '3': '나쁨', '4': '매우나쁨',
};

const MAJOR_CITIES = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '제주'];

export class AirKoreaScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.dataGoKrApiKey) return [];

    const posts: ScrapedPost[] = [];

    for (const sido of MAJOR_CITIES) {
      try {
        const { data } = await axios.get<AirKoreaResponse>(
          'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty',
          {
            params: {
              serviceKey: config.dataGoKrApiKey,
              sidoName: sido,
              returnType: 'json',
              numOfRows: 1,
              pageNo: 1,
              ver: '1.0',
            },
            timeout: 10000,
          },
        );

        if (data.response?.header?.resultCode !== '00') continue;

        const items = data.response?.body?.items;
        if (!items || items.length === 0) continue;

        const item = items[0];
        const khai = parseInt(item.khaiValue) || 0;
        const pm25 = parseInt(item.pm25Value) || 0;
        const pm10 = parseInt(item.pm10Value) || 0;
        const grade = GRADE_LABELS[item.khaiGrade] ?? '측정중';

        posts.push({
          sourceKey: 'airkorea',
          sourceName: '에어코리아',
          title: `${sido} 대기질: ${grade} (PM2.5: ${pm25}㎍/㎥, PM10: ${pm10}㎍/㎥)`,
          url: `https://www.airkorea.or.kr/web/sidoQualityComp498?sidoName=${encodeURIComponent(sido)}`,
          viewCount: khai,
          category: 'alert',
          metadata: {
            sido,
            station: item.stationName,
            pm10: pm10,
            pm25: pm25,
            khai: khai,
            grade,
            dataTime: item.dataTime,
          },
        });
      } catch {
        // Skip failed city, continue with others
      }
    }

    return posts;
  }
}
