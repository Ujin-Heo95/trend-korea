import type { Pool } from 'pg';
import { KcisaBaseScraper, stripHtml } from './kcisa-base.js';
import type { KcisaItem } from './kcisa-base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

/**
 * 한국문화예술위원회 행사정보 (KCISA meta/ARKeven)
 * XML 응답, 700+ 문화예술 행사 데이터
 */
export class KcisaEventScraper extends KcisaBaseScraper {
  constructor(pool: Pool) {
    super(pool, {
      apiUrl: 'https://api.kcisa.kr/openapi/service/rest/meta/ARKeven',
      apiKey: config.kcisaEventApiKey,
      sourceKey: 'kcisa_event',
      sourceName: '문화예술행사',
      category: 'performance',
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
          sourceKey: 'kcisa_event',
          sourceName: '문화예술행사',
          title: item.title!,
          url: item.url!,
          author: item.creator || undefined,
          viewCount: 0,
          commentCount: 0,
          publishedAt: this.parseDate(item.regDate),
          category: 'performance',
          metadata: {
            description: snippet,
            collectionDb: item.collectionDb,
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
