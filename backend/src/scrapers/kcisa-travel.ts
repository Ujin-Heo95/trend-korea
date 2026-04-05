import type { Pool } from 'pg';
import { KcisaBaseScraper, stripHtml } from './kcisa-base.js';
import type { KcisaItem } from './kcisa-base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

/**
 * 문화체육관광부 추천여행지 (KCISA API_CNV_061)
 * XML 응답, 1500+ 여행지 데이터
 */
export class KcisaTravelScraper extends KcisaBaseScraper {
  constructor(pool: Pool) {
    super(pool, {
      apiUrl: 'https://api.kcisa.kr/openapi/API_CNV_061/request',
      apiKey: config.kcisaTravelApiKey,
      sourceKey: 'kcisa_travel',
      sourceName: '추천여행지',
      category: 'travel',
      numOfRows: 30,
    });
  }

  protected mapItems(items: readonly KcisaItem[]): ScrapedPost[] {
    return items
      .filter(item => item.title && item.url)
      .map((item): ScrapedPost => {
        const description = item.description ? stripHtml(item.description) : '';
        const snippet = description.length > 120
          ? `${description.slice(0, 120)}…`
          : description;

        return {
          sourceKey: 'kcisa_travel',
          sourceName: '추천여행지',
          title: item.title!,
          url: item.url!,
          author: item.spatialCoverage || undefined,
          viewCount: item.viewCnt ? Number(item.viewCnt) || 0 : 0,
          commentCount: 0,
          publishedAt: this.parseDate(item.insertDate),
          category: 'travel',
          metadata: {
            description: snippet,
            reference: item.reference,
            spatialCoverage: item.spatialCoverage,
          },
        };
      });
  }

  private parseDate(dateStr: string | undefined): Date {
    if (!dateStr) return new Date();
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  }
}
