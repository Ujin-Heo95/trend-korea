import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { resolveKcisaRequest } from './korean-dns.js';

/**
 * KCISA (한국문화정보원) API 공통 베이스.
 * 모든 KCISA OpenAPI는 XML 응답 + 동일한 <response><header/><body><items><item/></items></body></response> 구조.
 */

export interface KcisaItem {
  readonly title?: string;
  readonly description?: string;
  readonly url?: string;
  readonly referenceIdentifier?: string;  // 이미지 URL
  readonly spatialCoverage?: string;      // 지역
  readonly collectionDb?: string;
  readonly regDate?: string;
  readonly insertDate?: string;
  readonly creator?: string;
  readonly rights?: string;
  readonly eventPeriod?: string;
  readonly subjectCategory?: string;
  readonly viewCnt?: string;
  readonly reference?: string;
  // CCA 통합 API 전용 필드 (대문자)
  readonly TITLE?: string;
  readonly DESCRIPTION?: string;
  readonly URL?: string;
  readonly IMAGE_OBJECT?: string;
  readonly SPATIAL_COVERAGE?: string;
  readonly PERIOD?: string;
  readonly EVENT_PERIOD?: string;
  readonly GENRE?: string;
  readonly CHARGE?: string;
  readonly CONTRIBUTOR?: string;
  readonly CONTACT_POINT?: string;
  readonly AUDIENCE?: string;
  readonly EVENT_SITE?: string;
  readonly COLLECTED_DATE?: string;
  readonly ISSUED_DATE?: string;
  readonly LOCAL_ID?: string;
  readonly CNTC_INSTT_NM?: string;
  readonly VIEW_COUNT?: string;
}

export interface KcisaConfig {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly sourceKey: string;
  readonly sourceName: string;
  readonly category: string;
  readonly numOfRows?: number;
}

function extractText(val: unknown): string {
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val) && val.length > 0) return String(val[0]).trim();
  if (typeof val === 'number') return String(val);
  return '';
}

export async function parseKcisaXml(xml: string): Promise<readonly KcisaItem[]> {
  const result = await parseStringPromise(xml, { explicitArray: false, trim: true });

  const body = result?.response?.body;
  if (!body?.items) return [];

  const rawItems = body.items.item;
  if (!rawItems) return [];

  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.map((item: Record<string, unknown>): KcisaItem => {
    const mapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(item)) {
      mapped[k] = extractText(v);
    }
    return mapped as unknown as KcisaItem;
  });
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseKcisaJson(data: unknown): readonly KcisaItem[] {
  const body = (data as Record<string, unknown>)?.response as Record<string, unknown> | undefined;
  const bodyInner = (body?.body ?? (data as Record<string, unknown>)?.body) as Record<string, unknown> | undefined;
  if (!bodyInner?.items) return [];

  const itemsWrapper = bodyInner.items as Record<string, unknown>;
  const rawItems = (itemsWrapper?.item ?? itemsWrapper) as unknown;
  if (!rawItems) return [];

  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return items.map((item: Record<string, unknown>): KcisaItem => {
    const mapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(item)) {
      mapped[k] = typeof v === 'string' ? v.trim() : String(v ?? '');
    }
    return mapped as unknown as KcisaItem;
  });
}

export abstract class KcisaBaseScraper extends BaseScraper {
  protected readonly kcisaConfig: KcisaConfig;

  constructor(pool: Pool, kcisaConfig: KcisaConfig) {
    super(pool);
    this.kcisaConfig = kcisaConfig;
  }

  /** XML/JSON 응답 자동 감지 파싱 */
  private async parseResponse(data: string): Promise<readonly KcisaItem[]> {
    const trimmed = data.trimStart();
    if (trimmed.startsWith('<')) {
      return parseKcisaXml(data);
    }
    try {
      return parseKcisaJson(JSON.parse(data));
    } catch {
      return parseKcisaXml(data);
    }
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!this.kcisaConfig.apiKey) return [];

    const resolved = await resolveKcisaRequest(this.kcisaConfig.apiUrl);
    const { data } = await axios.get(resolved.url, {
      params: {
        serviceKey: this.kcisaConfig.apiKey,
        numOfRows: this.kcisaConfig.numOfRows ?? 30,
        pageNo: 1,
      },
      headers: resolved.headers,
      timeout: 15000,
      responseType: 'text',
      httpsAgent: resolved.httpsAgent,
    });

    const items = await this.parseResponse(data);
    if (items.length === 0) return [];

    return this.mapItems(items).slice(0, 30);
  }

  protected abstract mapItems(items: readonly KcisaItem[]): ScrapedPost[];
}
