import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

interface UpbitTicker {
  market: string;
  trade_price: number;
  signed_change_rate: number;
  signed_change_price: number;
  acc_trade_volume_24h: number;
  acc_trade_price_24h: number;
  timestamp: number;
  high_price?: number;
  low_price?: number;
  prev_closing_price?: number;
}

const TOP_MARKETS = [
  'KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL', 'KRW-DOGE',
  'KRW-ADA', 'KRW-AVAX', 'KRW-DOT', 'KRW-LINK', 'KRW-MATIC',
  'KRW-SHIB', 'KRW-TRX', 'KRW-ATOM', 'KRW-ETC', 'KRW-NEAR',
  'KRW-APT', 'KRW-ARB', 'KRW-OP', 'KRW-SUI', 'KRW-SEI',
];

const MARKET_NAMES: Record<string, string> = {
  'KRW-BTC': '비트코인', 'KRW-ETH': '이더리움', 'KRW-XRP': '리플',
  'KRW-SOL': '솔라나', 'KRW-DOGE': '도지코인', 'KRW-ADA': '에이다',
  'KRW-AVAX': '아발란체', 'KRW-DOT': '폴카닷', 'KRW-LINK': '체인링크',
  'KRW-MATIC': '폴리곤', 'KRW-SHIB': '시바이누', 'KRW-TRX': '트론',
  'KRW-ATOM': '코스모스', 'KRW-ETC': '이더리움클래식', 'KRW-NEAR': '니어',
  'KRW-APT': '앱토스', 'KRW-ARB': '아비트럼', 'KRW-OP': '옵티미즘',
  'KRW-SUI': '수이', 'KRW-SEI': '세이',
};

export class UpbitScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const markets = TOP_MARKETS.join(',');
    const { data } = await axios.get<UpbitTicker[]>(
      `https://api.upbit.com/v1/ticker?markets=${markets}`,
      { timeout: 10_000 },
    );

    return data
      .sort((a, b) => Math.abs(b.signed_change_rate) - Math.abs(a.signed_change_rate))
      .slice(0, 30)
      .map(t => this.toPost(t));
  }

  private toPost(t: UpbitTicker): ScrapedPost {
    const symbol = t.market.replace('KRW-', '');
    const name = MARKET_NAMES[t.market] ?? symbol;
    const rate = (t.signed_change_rate * 100).toFixed(2);
    const sign = t.signed_change_rate >= 0 ? '+' : '';
    const price = t.trade_price.toLocaleString('ko-KR');

    return {
      sourceKey: 'upbit',
      sourceName: '업비트',
      title: `${name}(${symbol}) ${sign}${rate}% — ${price}원`,
      url: `https://upbit.com/exchange?code=CRIX.UPBIT.${t.market}`,
      viewCount: Math.round(t.acc_trade_price_24h / 1_000_000),
      category: 'finance',
      metadata: {
        symbol,
        price: t.trade_price,
        changeRate: t.signed_change_rate,
        changePrice: t.signed_change_price,
        volume24h: t.acc_trade_volume_24h,
        tradeValue24h: t.acc_trade_price_24h,
        highPrice: t.high_price,
        lowPrice: t.low_price,
        prevClose: t.prev_closing_price,
      },
    };
  }
}
