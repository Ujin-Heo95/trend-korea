import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

interface FestivalItem {
  readonly title: string;
  readonly addr1?: string;
  readonly addr2?: string;
  readonly firstimage?: string;
  readonly tel?: string;
  readonly eventstartdate?: string;
  readonly eventenddate?: string;
  readonly contentid?: string;
  readonly contenttypeid?: string;
  readonly areacode?: string;
  readonly sigungucode?: string;
}

interface KorServiceResponse {
  readonly response: {
    readonly header: { readonly resultCode: string; readonly resultMsg: string };
    readonly body: {
      readonly items: { readonly item: readonly FestivalItem[] | FestivalItem } | '';
      readonly numOfRows: number;
      readonly pageNo: number;
      readonly totalCount: number;
    };
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function parseItems(data: KorServiceResponse): readonly FestivalItem[] {
  const items = data.response?.body?.items;
  if (!items || typeof items === 'string') return [];
  const itemData = items.item;
  if (Array.isArray(itemData)) return itemData;
  if (itemData) return [itemData as FestivalItem];
  return [];
}

export class TourFestivalScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.dataGoKrApiKey) return [];

    const today = formatDate(new Date());

    const { data } = await axios.get<KorServiceResponse>(
      'https://apis.data.go.kr/B551011/KorService2/searchFestival2',
      {
        params: {
          serviceKey: config.dataGoKrApiKey,
          MobileOS: 'ETC',
          MobileApp: 'WeekLit',
          _type: 'json',
          numOfRows: 30,
          pageNo: 1,
          eventStartDate: today,
          arrange: 'D', // 수정일순 (최신)
        },
        timeout: 15000,
      },
    );

    if (data.response?.header?.resultCode !== '0000') {
      throw new Error(`[tour_festival] API error: ${data.response?.header?.resultMsg}`);
    }

    const items = parseItems(data);

    return items.slice(0, 30).map((item): ScrapedPost => {
      const addr = [item.addr1, item.addr2].filter(Boolean).join(' ');
      const query = encodeURIComponent(item.title);

      return {
        sourceKey: 'tour_festival',
        sourceName: '관광공사 축제/행사',
        title: item.title,
        url: item.contentid
          ? `https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=${item.contentid}`
          : `https://map.naver.com/p/search/${query}`,
        thumbnail: item.firstimage || undefined,
        author: addr || undefined,
        viewCount: 0,
        commentCount: 0,
        publishedAt: item.eventstartdate
          ? new Date(`${item.eventstartdate.slice(0, 4)}-${item.eventstartdate.slice(4, 6)}-${item.eventstartdate.slice(6, 8)}`)
          : new Date(),
        category: 'travel',
        metadata: {
          eventStartDate: item.eventstartdate,
          eventEndDate: item.eventenddate,
          address: addr,
          tel: item.tel,
          contentId: item.contentid,
          areaCode: item.areacode,
        },
      };
    });
  }
}
