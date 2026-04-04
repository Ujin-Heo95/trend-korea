import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

interface VisitorItem {
  readonly baseYmd: string;
  readonly areaNm: string;
  readonly touDivNm: string;
  readonly touNum: number;
}

interface DataLabResponse {
  readonly response: {
    readonly header: { readonly resultCode: string; readonly resultMsg: string };
    readonly body: {
      readonly items: { readonly item: readonly VisitorItem[] | VisitorItem } | '';
      readonly numOfRows: number;
      readonly pageNo: number;
      readonly totalCount: number;
    };
  };
}

// 6시간 쿨다운 (1,000건/월 제한 보호 → 하루 4회 = 월 ~120회)
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
let lastFetchTime = 0;

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function parseItems(data: DataLabResponse): readonly VisitorItem[] {
  const items = data.response?.body?.items;
  if (!items || typeof items === 'string') return [];
  const itemData = items.item;
  if (Array.isArray(itemData)) return itemData;
  if (itemData) return [itemData as VisitorItem];
  return [];
}

interface RegionStats {
  readonly region: string;
  readonly recentAvg: number;
  readonly previousAvg: number;
  readonly changePercent: number;
  readonly latestCount: number;
}

function computeRegionTrends(items: readonly VisitorItem[]): readonly RegionStats[] {
  // 국내 관광객만 필터
  const domestic = items.filter(i => i.touDivNm === '관광객' || i.touDivNm === '합계');

  // 지역별 일별 방문자 수 그룹핑
  const regionDays = new Map<string, Map<string, number>>();
  for (const item of domestic) {
    const dayMap = regionDays.get(item.areaNm) ?? new Map<string, number>();
    const existing = dayMap.get(item.baseYmd) ?? 0;
    dayMap.set(item.baseYmd, existing + item.touNum);
    regionDays.set(item.areaNm, dayMap);
  }

  const results: RegionStats[] = [];

  for (const [region, dayMap] of regionDays) {
    const sorted = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length < 4) continue;

    // 최근 3일 vs 이전 나머지
    const recentDays = sorted.slice(-3);
    const previousDays = sorted.slice(0, -3);

    const recentAvg = recentDays.reduce((sum, [, v]) => sum + v, 0) / recentDays.length;
    const previousAvg = previousDays.length > 0
      ? previousDays.reduce((sum, [, v]) => sum + v, 0) / previousDays.length
      : 0;

    const changePercent = previousAvg > 0
      ? Math.round(((recentAvg - previousAvg) / previousAvg) * 100)
      : 0;

    const latestCount = sorted[sorted.length - 1]?.[1] ?? 0;

    results.push({ region, recentAvg: Math.round(recentAvg), previousAvg: Math.round(previousAvg), changePercent, latestCount });
  }

  // 변화율 절대값 기준 내림차순
  return results
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 10);
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만명`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천명`;
  return `${n}명`;
}

export class TourVisitorScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.dataGoKrApiKey) return [];

    // 쿨다운 체크
    const now = Date.now();
    if (now - lastFetchTime < COOLDOWN_MS) return [];
    lastFetchTime = now;

    const endDate = new Date();
    // 데이터가 2-3일 지연될 수 있으므로 3일 전부터 조회
    endDate.setDate(endDate.getDate() - 2);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    const { data } = await axios.get<DataLabResponse>(
      'https://apis.data.go.kr/B551011/DataLabService/metcoRegnVisitrDDList',
      {
        params: {
          serviceKey: config.dataGoKrApiKey,
          MobileOS: 'ETC',
          MobileApp: 'WeekLit',
          _type: 'json',
          numOfRows: 1000,
          pageNo: 1,
          startYmd: formatDate(startDate),
          endYmd: formatDate(endDate),
        },
        timeout: 15000,
      },
    );

    if (data.response?.header?.resultCode !== '0000') {
      throw new Error(`[tour_visitor] API error: ${data.response?.header?.resultMsg}`);
    }

    const items = parseItems(data);
    const trends = computeRegionTrends(items);

    return trends.map((stat): ScrapedPost => {
      const trendIcon = stat.changePercent > 20 ? '🔥'
        : stat.changePercent > 0 ? '📈'
        : stat.changePercent < -20 ? '📉'
        : stat.changePercent < 0 ? '↘️'
        : '➡️';

      const changeLabel = stat.changePercent > 0
        ? `+${stat.changePercent}%`
        : `${stat.changePercent}%`;

      const dateStr = formatDate(endDate);

      return {
        sourceKey: 'tour_visitor',
        sourceName: '관광 빅데이터 방문객',
        title: `${trendIcon} ${stat.region} — 방문객 ${changeLabel} (${formatCount(stat.latestCount)})`,
        url: `https://datalab.visitkorea.or.kr/datalab/portal/loc/getLocBaseList.do?region=${encodeURIComponent(stat.region)}`,
        viewCount: stat.changePercent,
        commentCount: stat.latestCount,
        publishedAt: new Date(),
        category: 'travel',
        metadata: {
          region: stat.region,
          recentAvg: stat.recentAvg,
          previousAvg: stat.previousAvg,
          changePercent: stat.changePercent,
          latestCount: stat.latestCount,
          dataDate: dateStr,
        },
      };
    });
  }
}
