import axios from 'axios';
import type { Pool } from 'pg';
import { parseStringPromise } from 'xml2js';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

/*
  문화체육관광부 공연전시정보조회서비스 (data.go.kr)
  엔드포인트: /B553457/nopenapi/rest/publicperformancedisplays/period
  응답: XML
  파라미터: from, to, cPage, rows, place, keyword, sortStdr, serviceKey
*/

interface PerformanceItem {
  readonly title?: string;
  readonly place?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly realmName?: string;  // 장르 (연극, 뮤지컬, 전시 등)
  readonly area?: string;       // 지역
  readonly thumbnail?: string;
  readonly gpsX?: string;
  readonly gpsY?: string;
  readonly seq?: string;        // 고유번호
  readonly phone?: string;
}

// KOPIS가 이미 커버하는 장르
const KOPIS_GENRES = new Set(['뮤지컬', '연극', '콘서트', '클래식', '무용']);

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function extractText(val: unknown): string {
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val) && val.length > 0) return String(val[0]).trim();
  return '';
}

async function parseXmlItems(xml: string): Promise<readonly PerformanceItem[]> {
  const result = await parseStringPromise(xml, { explicitArray: false, trim: true });

  // 응답 구조: <response><msgBody><perforList>...</perforList></msgBody></response>
  // 또는 <response><msgBody><perforInfo>...</perforInfo></msgBody></response>
  const msgBody = result?.response?.msgBody;
  if (!msgBody) return [];

  const rawList = msgBody.perforList ?? msgBody.perforInfo;
  if (!rawList) return [];

  const items = Array.isArray(rawList) ? rawList : [rawList];

  return items.map((item: Record<string, unknown>): PerformanceItem => ({
    seq: extractText(item.seq),
    title: extractText(item.title),
    place: extractText(item.place),
    startDate: extractText(item.startDate),
    endDate: extractText(item.endDate),
    realmName: extractText(item.realmName),
    area: extractText(item.area),
    thumbnail: extractText(item.thumbnail),
    gpsX: extractText(item.gpsX),
    gpsY: extractText(item.gpsY),
    phone: extractText(item.phone),
  }));
}

export class KcisaPerformanceScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.dataGoKrApiKey) return [];

    const today = new Date();
    const from = formatDate(today);
    const toDate = new Date(today);
    toDate.setDate(toDate.getDate() + 30); // 향후 30일 공연
    const to = formatDate(toDate);

    const { data } = await axios.get(
      'https://apis.data.go.kr/B553457/nopenapi/rest/publicperformancedisplays/period',
      {
        params: {
          serviceKey: config.dataGoKrApiKey,
          from,
          to,
          cPage: 1,
          rows: 50,
          sortStdr: 1, // 등록일순
        },
        timeout: 15000,
        responseType: 'text',
      },
    );

    const items = await parseXmlItems(data);
    if (items.length === 0) return [];

    // KOPIS와 겹치는 장르 제외
    const filtered = items.filter(item => {
      const genre = item.realmName ?? '';
      return !KOPIS_GENRES.has(genre);
    });

    return filtered.slice(0, 30).map((item): ScrapedPost => {
      const genre = item.realmName || '공연';
      const venue = item.place || '';
      const title = item.title || '';

      const displayTitle = venue
        ? `[${genre}] ${title} — ${venue}`
        : `[${genre}] ${title}`;

      const postUrl = item.seq
        ? `https://www.culture.go.kr/search/search.do?keyword=${encodeURIComponent(title)}`
        : `https://www.culture.go.kr/search/search.do?keyword=${encodeURIComponent(title)}`;

      return {
        sourceKey: 'kcisa_performance',
        sourceName: '문화예술공연(통합)',
        title: displayTitle,
        url: postUrl,
        thumbnail: item.thumbnail || undefined,
        author: item.area || undefined,
        viewCount: 0,
        commentCount: 0,
        eventDate: this.parseDateStr(item.startDate),
        category: 'performance',
        metadata: {
          dataSource: 'culture_data_go_kr',
          genre,
          venue,
          area: item.area,
          startDate: item.startDate,
          endDate: item.endDate,
          seq: item.seq,
          phone: item.phone,
        },
      };
    });
  }

  private parseDateStr(dateStr: string | undefined): Date {
    if (!dateStr) return new Date();
    // "20260401" 형태
    if (dateStr.length === 8) {
      const d = new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`);
      if (!isNaN(d.getTime())) return d;
    }
    // "2026-04-01" 형태
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    return new Date();
  }
}
