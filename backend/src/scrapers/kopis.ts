import axios from 'axios';
import type { Pool } from 'pg';
import { parseStringPromise } from 'xml2js';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { config } from '../config/index.js';

interface BoxofficeItem {
  mt20id: string;
  prfnm: string;
  prfplcnm: string;
  cate: string;
  poster?: string;
  rnum?: string;
  prfdtcnt?: string;
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

    const genres = ['GGGA', 'AAAA', 'CCCD'] as const;
    const allPosts: ScrapedPost[] = [];

    for (const catecode of genres) {
      try {
        const { data: xml } = await axios.get(
          'http://www.kopis.or.kr/openApi/restful/boxoffice',
          {
            params: {
              service: config.kopisApiKey,
              stdate,
              eddate,
              catecode,
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
        for (const item of list.slice(0, 10)) {
          allPosts.push({
            sourceKey: 'kopis_boxoffice',
            sourceName: 'KOPIS 예매순위',
            title: `[${item.cate}] ${item.prfnm} — ${item.prfplcnm}`,
            url: `http://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?menuId=MNU_00020&mt20Id=${item.mt20id}`,
            thumbnail: item.poster || undefined,
            author: item.prfplcnm || undefined,
            viewCount: parseInt(item.rnum ?? '0', 10),
            commentCount: parseInt(item.prfdtcnt ?? '0', 10),
            publishedAt: new Date(),
            category: 'entertainment',
          });
        }
      } catch (err) {
        console.warn(`[kopis] genre ${catecode} failed: ${err}`);
      }
    }

    return allPosts.slice(0, 30);
  }
}
