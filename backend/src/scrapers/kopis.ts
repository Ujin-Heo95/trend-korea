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

    // 2026-04-12: 직렬 5 genre × 순차 상세 fetch → 30s timeout 반복.
    //   병렬화: genre 5개를 Promise.all 로 동시 + 상세는 최상위 5개만 (10→5).
    //   예산: 5 병렬 fetch ~5s + detail 5 병렬 ~3s ≈ 10s (이전 20+s).
    const genreResults = await Promise.allSettled(
      GENRES.map(async (genre) => {
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
            timeout: 12_000,
            responseType: 'text',
          }
        );
        const parsed = await parseStringPromise(xml, { explicitArray: false });
        const items: BoxofficeItem | BoxofficeItem[] | undefined = parsed?.boxofs?.boxof;
        if (!items) return [] as ScrapedPost[];
        const list = Array.isArray(items) ? items : [items];
        const sliced = list.slice(0, 5);
        // 상세 5개 병렬 (delay 150ms 로 호출 간격 유지)
        const detailLimit = pLimit(3);
        const details = await Promise.all(
          sliced.map(item =>
            detailLimit(async () => {
              await delay(150);
              return fetchDetail(item.mt20id);
            })
          )
        );
        return sliced.map((item, i) => {
          const detail = details[i];
          const posterUrl = detail?.poster || item.poster || undefined;
          return {
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
          } satisfies ScrapedPost;
        });
      })
    );
    const allPosts: ScrapedPost[] = [];
    genreResults.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        allPosts.push(...r.value);
      } else {
        console.warn(`[kopis] genre ${GENRES[idx].code} (${GENRES[idx].name}) failed: ${r.reason}`);
      }
    });
    return allPosts.slice(0, 25);
  }
}
