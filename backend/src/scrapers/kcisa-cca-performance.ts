import type { Pool } from 'pg';
import { KcisaBaseScraper, stripHtml } from './kcisa-base.js';
import type { KcisaItem } from './kcisa-base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

/**
 * 한국문화정보원 공연정보(통합) (KCISA API_CCA_144)
 * 최신 공연 데이터 (예술의전당, 세종문화회관 등)
 */
export class KcisaCcaPerformanceScraper extends KcisaBaseScraper {
  constructor(pool: Pool) {
    super(pool, {
      apiUrl: 'https://api.kcisa.kr/openapi/API_CCA_144/request',
      apiKey: config.kcisaPerformanceApiKey,
      sourceKey: 'kcisa_cca_performance',
      sourceName: '공연정보(통합)',
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
        const genre = item.GENRE || '';
        const venue = item.CNTC_INSTT_NM || item.EVENT_SITE || '';
        const charge = item.CHARGE || '';

        const displayTitle = genre && venue
          ? `[${genre}] ${title} — ${venue}`
          : genre
            ? `[${genre}] ${title}`
            : title;

        return {
          sourceKey: 'kcisa_cca_performance',
          sourceName: '공연정보(통합)',
          title: displayTitle,
          url,
          thumbnail: item.IMAGE_OBJECT || undefined,
          author: item.CONTRIBUTOR || undefined,
          viewCount: 0,
          commentCount: 0,
          publishedAt: this.parsePeriod(item.PERIOD || item.ISSUED_DATE),
          category: 'performance',
          metadata: {
            genre,
            venue,
            charge,
            audience: item.AUDIENCE,
            contactPoint: item.CONTACT_POINT,
            period: item.PERIOD,
            eventPeriod: item.EVENT_PERIOD,
          },
        };
      });
  }

  private parsePeriod(dateStr: string | undefined): Date {
    if (!dateStr) return new Date();
    // "2026-04-04~2026-04-04" 또는 "2025-09-19" 형태
    const start = dateStr.split('~')[0]?.trim();
    if (!start) return new Date();
    const d = new Date(start);
    return isNaN(d.getTime()) ? new Date() : d;
  }
}
