import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

interface KrxStock {
  ISU_SRT_CD: string;
  ISU_ABBRV: string;
  TDD_CLSPRC: string;
  CMPPREVDD_PRC: string;
  FLUC_RT: string;
  ACC_TRDVOL: string;
  MKT_NM: string;
  TDD_HGPRC?: string;
  TDD_LWPRC?: string;
  MKTCAP?: string;
}

export class KrxScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    try {
      const today = this.formatDate(new Date());
      const stocks = await this.fetchMarketData(today);

      const sorted = stocks
        .filter(s => s.FLUC_RT && s.FLUC_RT !== '0.00')
        .sort((a, b) => Math.abs(this.parseRate(b.FLUC_RT)) - Math.abs(this.parseRate(a.FLUC_RT)))
        .slice(0, 30);

      return sorted.map(s => this.toPost(s));
    } catch {
      return [];
    }
  }

  private async fetchMarketData(date: string): Promise<KrxStock[]> {
    const params = new URLSearchParams({
      bld: 'dbms/MDC/STAT/standard/MDCSTAT01501',
      mktId: 'STK',
      trdDd: date,
      share: '1',
      money: '1',
      csvxls_isNo: 'false',
    });

    const { data } = await axios.post(
      'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd',
      params.toString(),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'http://data.krx.co.kr',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        timeout: 15000,
      },
    );

    return data.OutBlock_1 ?? [];
  }

  private parseRate(rate: string): number {
    return parseFloat(rate.replace(/,/g, '')) || 0;
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  private toPost(s: KrxStock): ScrapedPost {
    const rate = s.FLUC_RT.startsWith('-') ? s.FLUC_RT : `+${s.FLUC_RT}`;
    return {
      sourceKey: 'krx',
      sourceName: 'KRX 시장',
      title: `${s.ISU_ABBRV} ${rate}% (${s.TDD_CLSPRC}원)`,
      url: `http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?boxid=finder_stkisu0101&input_stkisu=${s.ISU_SRT_CD}`,
      viewCount: parseInt(s.ACC_TRDVOL.replace(/,/g, '')) || 0,
      category: 'finance',
      metadata: {
        ticker: s.ISU_SRT_CD,
        market: s.MKT_NM,
        prevClose: parseInt(s.CMPPREVDD_PRC?.replace(/,/g, '') ?? '') || undefined,
        highPrice: parseInt(s.TDD_HGPRC?.replace(/,/g, '') ?? '') || undefined,
        lowPrice: parseInt(s.TDD_LWPRC?.replace(/,/g, '') ?? '') || undefined,
        marketCap: parseInt(s.MKTCAP?.replace(/,/g, '') ?? '') || undefined,
      },
    };
  }
}
