import axios from 'axios';
import type { Pool } from 'pg';
import { parseStringPromise } from 'xml2js';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface EventRow {
  readonly CODENAME: readonly string[];
  readonly GUNAME: readonly string[];
  readonly TITLE: readonly string[];
  readonly PLACE: readonly string[];
  readonly ORG_NAME: readonly string[];
  readonly ORG_LINK: readonly string[];
  readonly MAIN_IMG: readonly string[];
  readonly STRTDATE: readonly string[];
  readonly END_DATE: readonly string[];
  readonly USE_FEE: readonly string[];
  readonly IS_FREE: readonly string[];
  readonly USE_TRGT: readonly string[];
  readonly HMPG_ADDR: readonly string[];
  readonly DATE: readonly string[];
  readonly LOT: readonly string[];
  readonly LAT: readonly string[];
}

interface CulturalEventXml {
  readonly culturalEventInfo: {
    readonly list_total_count: readonly string[];
    readonly RESULT: readonly { readonly CODE: readonly string[] }[];
    readonly row: readonly EventRow[];
  };
}

interface ErrorXml {
  readonly RESULT: {
    readonly CODE: readonly string[];
    readonly MESSAGE: readonly string[];
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class SeoulCulturalEventScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.seoulOpenApiKey) {
      logger.warn('[seoul-cultural-event] SEOUL_OPEN_API_KEY missing — skipping');
      return [];
    }

    const today = formatDate(new Date());
    const url = `http://openapi.seoul.go.kr:8088/${config.seoulOpenApiKey}/xml/culturalEventInfo/1/30/%20/%20/${today}/`;

    const { data: xml } = await axios.get<string>(url, {
      timeout: 15000,
      responseType: 'text',
    });

    const parsed = await parseStringPromise(xml) as CulturalEventXml | ErrorXml;

    // Handle "no data" response
    if ('RESULT' in parsed && !('culturalEventInfo' in parsed)) {
      const code = (parsed as ErrorXml).RESULT?.CODE?.[0];
      if (code === 'INFO-200') return [];
      throw new Error(`[seoul-cultural-event] API error: ${code}`);
    }

    const info = (parsed as CulturalEventXml).culturalEventInfo;
    if (!info?.row) return [];

    const rows = Array.isArray(info.row) ? info.row : [info.row];

    return rows.slice(0, 30).map((row): ScrapedPost => {
      const genre = row.CODENAME?.[0] ?? '';
      const title = row.TITLE?.[0] ?? '';
      const place = row.PLACE?.[0] ?? '';
      const district = row.GUNAME?.[0] ?? '';
      const orgLink = row.ORG_LINK?.[0] ?? '';
      const hmpgAddr = row.HMPG_ADDR?.[0] ?? '';
      const thumbnail = row.MAIN_IMG?.[0] ?? '';
      const startDate = row.STRTDATE?.[0] ?? '';
      const endDate = row.END_DATE?.[0] ?? '';
      const fee = row.USE_FEE?.[0] ?? '';
      const isFree = row.IS_FREE?.[0] ?? '';
      const target = row.USE_TRGT?.[0] ?? '';

      const displayTitle = genre
        ? `[${genre}] ${title} — ${place}`
        : `${title} — ${place}`;

      return {
        sourceKey: 'seoul_cultural_event',
        sourceName: '서울문화행사',
        title: displayTitle,
        url: orgLink || hmpgAddr,
        thumbnail: thumbnail || undefined,
        author: district || undefined,
        publishedAt: startDate
          ? new Date(startDate.slice(0, 10))
          : new Date(),
        category: 'performance',
        metadata: {
          genre,
          place,
          district,
          fee: isFree === '무료' ? '무료' : fee,
          targetAudience: target,
          startDate: startDate.slice(0, 10),
          endDate: endDate.slice(0, 10),
        },
      };
    });
  }
}
