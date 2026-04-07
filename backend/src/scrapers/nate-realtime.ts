import axios from 'axios';
import iconv from 'iconv-lite';
import type { Pool } from 'pg';
import { TrendSignalScraper } from './trend-base.js';
import type { TrendKeywordInput } from './types.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

// Nate 실시간 검색어 JSON 엔드포인트
// 응답 형태: [["순위", "제목", "방향(+/-/n)", "변동폭", "키워드"], ...]
type NateKeywordRow = [string, string, string, string, string];

export class NateRealtimeScraper extends TrendSignalScraper {
  constructor(pool: Pool) { super(pool); }

  protected override getSourceKey(): string { return 'nate_realtime'; }

  async fetchTrendKeywords(): Promise<TrendKeywordInput[]> {
    const now = new Date();
    const v = now.toISOString().replace(/[-T:Z.]/g, '').slice(0, 12);
    const url = `https://www.nate.com/js/data/jsonLiveKeywordDataV1.js?v=${v}`;

    const { data } = await axios.get<ArrayBuffer>(url, {
      headers: UA,
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    const decoded = iconv.decode(Buffer.from(data), 'euc-kr');

    let rows: NateKeywordRow[];
    try {
      rows = JSON.parse(decoded);
    } catch {
      throw new Error(`Nate realtime: JSON parse failed (body starts with: ${decoded.slice(0, 80)})`);
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Nate realtime: empty or invalid response');
    }

    return rows.slice(0, 30).map((row): TrendKeywordInput => {
      const rank = parseInt(row[0], 10);
      const direction = row[2] as '+' | '-' | 'n';
      const change = parseInt(row[3], 10) || 0;
      const keyword = row[4];

      return {
        keyword,
        sourceKey: 'nate_realtime',
        signalStrength: Math.max(1.0 - (rank - 1) * 0.03, 0.05),
        rankPosition: rank,
        rankDirection: direction,
        rankChange: change,
        metadata: { headline: row[1] },
      };
    });
  }
}
