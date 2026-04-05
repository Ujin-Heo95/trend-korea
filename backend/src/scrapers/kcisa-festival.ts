import type { Pool } from 'pg';
import { KcisaBaseScraper, stripHtml } from './kcisa-base.js';
import type { KcisaItem } from './kcisa-base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

/**
 * 문화체육관광부 지역축제정보 (KCISA meta4/getKCPG0504)
 * XML 응답, 13000+ 축제/행사 데이터
 */
export class KcisaFestivalScraper extends KcisaBaseScraper {
  constructor(pool: Pool) {
    super(pool, {
      apiUrl: 'https://api.kcisa.kr/openapi/service/rest/meta4/getKCPG0504',
      apiKey: config.kcisaFestivalApiKey,
      sourceKey: 'kcisa_festival',
      sourceName: '지역축제정보',
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
          sourceKey: 'kcisa_festival',
          sourceName: '지역축제정보',
          title: item.title!,
          url: item.url!,
          thumbnail: item.referenceIdentifier || undefined,
          author: item.spatialCoverage || undefined,
          viewCount: 0,
          commentCount: 0,
          publishedAt: this.parseDate(item.regDate),
          category: 'travel',
          metadata: {
            description: snippet,
            eventPeriod: item.eventPeriod,
            subjectCategory: item.subjectCategory,
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
