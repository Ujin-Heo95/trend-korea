import axios from 'axios';
import pLimit from 'p-limit';
import type { Pool } from 'pg';
import { parseStringPromise } from 'xml2js';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';
import { LRUCache } from '../cache/lru.js';

interface BoxofficeItem {
  mt20id: string;
  prfnm: string;
  prfplcnm: string;
  cate: string;
  poster?: string;
  rnum?: string;
  prfdtcnt?: string;
}

interface KopisDetail {
  poster?: string;
  startDate?: string;
  endDate?: string;
  cast?: string;
  runtime?: string;
  priceInfo?: string;
  ticketUrl?: string;
  fetchedAt: number;
}

// 모듈 레벨 캐시 (6시간 TTL, 최대 500 엔트리)
const detailCache = new LRUCache<KopisDetail>(500, 6 * 60 * 60 * 1000);

const GENRES = [
  { code: 'GGGA', name: '뮤지컬' },
  { code: 'AAAA', name: '연극' },
  { code: 'CCCD', name: '대공연(콘서트)' },
  { code: 'BBBC', name: '클래식' },
  { code: 'EEEA', name: '무용' },
] as const;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchDetail(mt20id: string): Promise<KopisDetail | null> {
  // 캐시 확인 (LRU — TTL + size limit 자동 관리)
  const cached = detailCache.get(mt20id);
  if (cached) return cached;

  try {
    const { data: xml } = await axios.get(
      `http://www.kopis.or.kr/openApi/restful/pblprfr/${mt20id}`,
      {
        params: { service: config.kopisApiKey },
        timeout: 10000,
        responseType: 'text',
      }
    );

    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const db = parsed?.dbs?.db;
    if (!db) return null;

    // 예매 링크 추출
    let ticketUrl: string | undefined;
    const relates = db.relates?.relate;
    if (relates) {
      const relateList = Array.isArray(relates) ? relates : [relates];
      ticketUrl = relateList[0]?.relateurl || undefined;
    }

    const detail: KopisDetail = {
      poster: db.poster || undefined,
      startDate: db.prfpdfrom || undefined,
      endDate: db.prfpdto || undefined,
      cast: db.prfcast || undefined,
      runtime: db.prfruntime || undefined,
      priceInfo: db.pcseguidance || undefined,
      ticketUrl,
      fetchedAt: Date.now(),
    };

    detailCache.set(mt20id, detail);
    return detail;
  } catch {
    return null;
  }
}

export class KopisBoxofficeScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.kopisApiKey) return [];

    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const stdate = fmt(weekAgo);
    const eddate = fmt(today);
    const date = fmt(today);

    const allPosts: ScrapedPost[] = [];
    const detailLimit = pLimit(1);

    for (const genre of GENRES) {
      try {
        const { data: xml } = await axios.get(
          'http://www.kopis.or.kr/openApi/restful/boxoffice',
          {
            params: {
              service: config.kopisApiKey,
              stdate,
              eddate,
              catecode: genre.code,
              date,
            },
            timeout: 15000,
            responseType: 'text',
          }
        );

        const parsed = await parseStringPromise(xml, { explicitArray: false });
        const items: BoxofficeItem | BoxofficeItem[] | undefined = parsed?.boxofs?.boxof;
        if (!items) continue;

        const list = Array.isArray(items) ? items : [items];
        const sliced = list.slice(0, 10);

        // 상위 5개만 상세 API 조회 (API 호출 절감)
        const details = await Promise.all(
          sliced.map((item, idx) =>
            idx < 5
              ? detailLimit(async () => {
                  await delay(300);
                  return fetchDetail(item.mt20id);
                })
              : Promise.resolve(null)
          )
        );

        for (let i = 0; i < sliced.length; i++) {
          const item = sliced[i];
          const detail = details[i];

          const posterUrl = detail?.poster || item.poster || undefined;

          allPosts.push({
            sourceKey: 'kopis_boxoffice',
            sourceName: 'KOPIS 예매순위',
            title: `[${item.cate}] ${item.prfnm} — ${item.prfplcnm}`,
            url: `http://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?menuId=MNU_00020&mt20Id=${item.mt20id}`,
            thumbnail: posterUrl,
            author: detail?.cast?.split(',')[0]?.trim() || undefined,
            viewCount: parseInt(item.rnum ?? '0', 10),
            commentCount: parseInt(item.prfdtcnt ?? '0', 10),
            publishedAt: new Date(),
            category: 'performance',
            metadata: {
              rank: parseInt(item.rnum ?? '0', 10),
              genre: item.cate,
              genreCode: genre.code,
              performanceName: item.prfnm,
              venue: item.prfplcnm,
              performanceId: item.mt20id,
              posterUrl,
              startDate: detail?.startDate,
              endDate: detail?.endDate,
              cast: detail?.cast,
              runtime: detail?.runtime,
              priceInfo: detail?.priceInfo,
              ticketUrl: detail?.ticketUrl,
              dataWeekStart: stdate,
              dataWeekEnd: eddate,
            },
          });
        }
      } catch (err) {
        console.warn(`[kopis] genre ${genre.code} (${genre.name}) failed: ${err}`);
      }
    }

    return allPosts.slice(0, 50);
  }
}
