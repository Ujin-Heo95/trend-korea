import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

/**
 * 한국관광공사 관광사진 정보 (PhotoGalleryService1)
 * JSON 응답, 6000+ 관광 사진 데이터
 */

interface PhotoItem {
  readonly galContentId: string;
  readonly galTitle: string;
  readonly galWebImageUrl: string;
  readonly galPhotographyLocation: string;
  readonly galPhotographer: string;
  readonly galSearchKeyword: string;
  readonly galCreatedtime: string;
  readonly galModifiedtime: string;
  readonly galPhotographyMonth: string;
}

interface PhotoResponse {
  readonly response: {
    readonly header: { readonly resultCode: string; readonly resultMsg: string };
    readonly body: {
      readonly items: { readonly item: readonly PhotoItem[] | PhotoItem } | '';
      readonly numOfRows: number;
      readonly pageNo: number;
      readonly totalCount: number;
    };
  };
}

export class TourPhotoScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.dataGoKrApiKey) return [];

    const { data } = await axios.get<PhotoResponse>(
      'https://apis.data.go.kr/B551011/PhotoGalleryService1/galleryList1',
      {
        params: {
          serviceKey: config.dataGoKrApiKey,
          MobileOS: 'ETC',
          MobileApp: 'WeekLit',
          _type: 'json',
          numOfRows: 30,
          pageNo: 1,
          arrange: 'D', // 수정일순
        },
        timeout: 15000,
      },
    );

    if (data.response?.header?.resultCode !== '0000') {
      throw new Error(`[tour_photo] API error: ${data.response?.header?.resultMsg}`);
    }

    const items = this.parseItems(data);

    return items.slice(0, 30).map((item): ScrapedPost => {
      const query = encodeURIComponent(item.galTitle);

      return {
        sourceKey: 'tour_photo',
        sourceName: '관광사진',
        title: item.galTitle,
        url: `https://korean.visitkorea.or.kr/search/search.do?keyword=${query}`,
        thumbnail: item.galWebImageUrl || undefined,
        author: item.galPhotographyLocation || undefined,
        viewCount: 0,
        commentCount: 0,
        publishedAt: this.parseCreatedTime(item.galCreatedtime),
        category: 'travel',
        metadata: {
          photographer: item.galPhotographer,
          location: item.galPhotographyLocation,
          keywords: item.galSearchKeyword,
          contentId: item.galContentId,
        },
      };
    });
  }

  private parseItems(data: PhotoResponse): readonly PhotoItem[] {
    const items = data.response?.body?.items;
    if (!items || typeof items === 'string') return [];
    const itemData = items.item;
    if (Array.isArray(itemData)) return itemData;
    if (itemData) return [itemData as PhotoItem];
    return [];
  }

  private parseCreatedTime(dateStr: string): Date {
    // "20100420024817" → "2010-04-20T02:48:17"
    if (dateStr.length >= 8) {
      const d = new Date(
        `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
      );
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }
}
