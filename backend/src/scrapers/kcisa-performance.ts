import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

interface KcisaItem {
  readonly title?: string;
  readonly type?: string;
  readonly period?: string;
  readonly eventPeriod?: string;
  readonly eventSite?: string;
  readonly charge?: string;
  readonly contactPoint?: string;
  readonly duration?: string;
  readonly url?: string;
  readonly imageObject?: string;
  readonly description?: string;
  readonly viewCount?: number;
}

interface KcisaResponse {
  readonly header: { readonly resultCode: string; readonly resultMsg: string };
  readonly body: {
    readonly items: { readonly item: readonly KcisaItem[] } | null;
    readonly totalCount: number;
    readonly numOfRows: number;
    readonly pageNo: number;
  };
}

// KOPIS가 이미 커버하는 장르 (뮤지컬, 연극, 콘서트, 클래식, 무용)
const KOPIS_GENRES = new Set(['뮤지컬', '연극', '콘서트', '클래식', '무용']);

// KCISA에서 가져올 장르 (KOPIS 미커버)
const TARGET_DTYPES = ['전시', '국악', '기타'] as const;

export class KcisaPerformanceScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.kcisaApiKey) return [];

    const allPosts: ScrapedPost[] = [];

    for (const dtype of TARGET_DTYPES) {
      const posts = await this.fetchByType(dtype);
      allPosts.push(...posts);
    }

    return allPosts.slice(0, 30);
  }

  private async fetchByType(dtype: string): Promise<ScrapedPost[]> {
    try {
      const { data } = await axios.get<KcisaResponse>(
        'https://api.kcisa.kr/openapi/CNV_060/request',
        {
          params: {
            serviceKey: config.kcisaApiKey,
            numOfRows: 15,
            pageNo: 1,
          },
          timeout: 15000,
        },
      );

      if (data.header?.resultCode !== '0000') {
        console.warn(`[kcisa_performance] API warning for ${dtype}: ${data.header?.resultMsg}`);
        return [];
      }

      const items = data.body?.items?.item;
      if (!items || !Array.isArray(items)) return [];

      // KOPIS와 겹치는 장르 제외
      const filtered = items.filter(item => {
        const type = item.type?.trim() ?? '';
        return !KOPIS_GENRES.has(type);
      });

      return filtered.map((item): ScrapedPost => {
        const type = item.type?.trim() ?? dtype;
        const venue = item.eventSite?.trim() ?? '';
        const title = item.title?.trim() ?? '';

        const displayTitle = venue
          ? `[${type}] ${title} — ${venue}`
          : `[${type}] ${title}`;

        const postUrl = item.url?.trim()
          || `https://www.culture.go.kr/search/search.do?keyword=${encodeURIComponent(title)}`;

        return {
          sourceKey: 'kcisa_performance',
          sourceName: '문화예술공연(통합)',
          title: displayTitle,
          url: postUrl,
          thumbnail: item.imageObject || undefined,
          viewCount: item.viewCount ?? 0,
          commentCount: 0,
          publishedAt: this.parsePeriodDate(item.period ?? item.eventPeriod),
          category: 'performance',
          metadata: {
            dataSource: 'kcisa',
            type,
            period: item.period,
            eventPeriod: item.eventPeriod,
            venue,
            charge: item.charge,
            duration: item.duration,
            viewCount: item.viewCount,
          },
        };
      });
    } catch (error) {
      throw new Error(
        `[kcisa_performance] ${dtype}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  private parsePeriodDate(period: string | undefined): Date {
    if (!period) return new Date();
    // "2026-04-01 ~ 2026-04-30" 또는 "20260401" 형태
    const match = period.match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if (match) {
      const d = new Date(`${match[1]}-${match[2]}-${match[3]}`);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }
}
