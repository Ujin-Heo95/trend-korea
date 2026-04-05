import type { Pool } from 'pg';
import { KcisaBaseScraper } from './kcisa-base.js';
import type { KcisaItem } from './kcisa-base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

/**
 * 한국문화정보원 전시정보(통합) (KCISA API_CCA_145)
 * 국립박물관, 미술관 등 전시 데이터
 */
export class KcisaCcaExhibitionScraper extends KcisaBaseScraper {
  constructor(pool: Pool) {
    super(pool, {
      apiUrl: 'https://api.kcisa.kr/openapi/API_CCA_145/request',
      apiKey: config.kcisaExhibitionApiKey,
      sourceKey: 'kcisa_cca_exhibition',
      sourceName: '전시정보(통합)',
      category: 'performance',
      numOfRows: 30,
    });
  }

  protected mapItems(items: readonly KcisaItem[]): ScrapedPost[] {
    const seen = new Set<string>();
    return items
      .filter(item => {
        const url = item.URL || item.url || '';
        if (!url || !(item.TITLE || item.title)) return false;
        if (seen.has(url)) return false;
        seen.add(url);
        return true;
      })
      .map((item): ScrapedPost => {
        const title = item.TITLE || item.title || '';
        const url = item.URL || item.url || '';
        const venue = item.CNTC_INSTT_NM || item.EVENT_SITE || '';
        const contributor = item.CONTRIBUTOR || '';

        const displayTitle = venue
          ? `[전시] ${title} — ${venue}`
          : `[전시] ${title}`;

        return {
          sourceKey: 'kcisa_cca_exhibition',
          sourceName: '전시정보(통합)',
          title: displayTitle,
          url,
          thumbnail: item.IMAGE_OBJECT || undefined,
          author: contributor || undefined,
          viewCount: 0,
          commentCount: 0,
          publishedAt: this.parsePeriod(item.PERIOD || item.ISSUED_DATE),
          category: 'performance',
          metadata: {
            venue,
            charge: item.CHARGE,
            audience: item.AUDIENCE,
            contactPoint: item.CONTACT_POINT,
            period: item.PERIOD,
          },
        };
      });
  }

  private parsePeriod(dateStr: string | undefined): Date {
    if (!dateStr) return new Date();
    const start = dateStr.split('~')[0]?.split(' ')[0]?.trim();
    if (!start) return new Date();
    const d = new Date(start);
    return isNaN(d.getTime()) ? new Date() : d;
  }
}
