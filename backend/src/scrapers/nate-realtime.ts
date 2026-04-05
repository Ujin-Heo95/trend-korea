import axios from 'axios';
import iconv from 'iconv-lite';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

// Nate 실시간 검색어 JSON 엔드포인트
// 응답 형태: [["순위", "제목", "방향(+/-/n)", "변동폭", "키워드"], ...]
type NateKeywordRow = [string, string, string, string, string];

export class NateRealtimeScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const now = new Date();
    const v = now.toISOString().replace(/[-T:Z.]/g, '').slice(0, 12);
    const url = `https://www.nate.com/js/data/jsonLiveKeywordDataV1.js?v=${v}`;

    const { data } = await axios.get<ArrayBuffer>(url, {
      headers: UA,
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    const decoded = iconv.decode(Buffer.from(data), 'euc-kr');
    const rows: NateKeywordRow[] = JSON.parse(decoded);

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Nate realtime: empty or invalid response');
    }

    return rows.map((row): ScrapedPost => {
      const rank = parseInt(row[0], 10);
      const headline = row[1];
      const direction = row[2]; // '+' = 상승, '-' = 하락, 'n' = 신규
      const change = parseInt(row[3], 10) || 0;
      const keyword = row[4];

      const dirIcon = direction === '+' ? '🔺' : direction === '-' ? '🔻' : '🆕';
      const query = encodeURIComponent(keyword);

      return {
        sourceKey: 'nate_realtime',
        sourceName: '네이트 실시간 검색어',
        title: `${dirIcon} ${rank}위 ${headline}`,
        url: `https://search.nate.com/search/all?q=${query}`,
        viewCount: 100 - (rank - 1) * 10, // 순위 기반 가상 인기도 (100~10)
        publishedAt: new Date(),
        category: 'trend',
        metadata: {
          keyword,
          rank,
          direction,
          change,
        },
      };
    }).slice(0, 30);
  }
}
