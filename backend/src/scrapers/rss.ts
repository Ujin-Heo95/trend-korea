import Parser from 'rss-parser';
import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

interface RssScraperConfig {
  sourceKey: string;
  sourceName: string;
  feedUrl: string;
  maxItems: number;
  pool: Pool;
  encoding?: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const defaultParser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': UA,
    Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.1',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  },
});

const youtubeParser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': UA,
    Accept: 'application/atom+xml, application/xml, text/xml, */*;q=0.1',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  },
  customFields: {
    item: [
      ['media:group', 'mediaGroup'],
    ],
  },
});

const googleTrendsParser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': UA,
    Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.1',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  },
  customFields: {
    item: [
      ['ht:approx_traffic', 'htApproxTraffic'],
      ['ht:picture', 'htPicture'],
      ['ht:news_item_url', 'htNewsItemUrl'],
      ['ht:news_item_title', 'htNewsItemTitle'],
    ],
  },
});

function safeDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export class RssScraper extends BaseScraper {
  private cfg: RssScraperConfig;

  constructor(cfg: RssScraperConfig) {
    super(cfg.pool);
    this.cfg = cfg;
  }

  async fetch(): Promise<ScrapedPost[]> {
    const parser = this.cfg.sourceKey === 'google_trends'
      ? googleTrendsParser
      : this.cfg.sourceKey.startsWith('youtube_')
        ? youtubeParser
        : defaultParser;

    const feed = this.cfg.encoding && this.cfg.encoding !== 'utf-8'
      ? await this.fetchWithEncoding(parser, this.cfg.encoding)
      : await parser.parseURL(this.cfg.feedUrl);

    return (feed.items ?? [])
      .slice(0, this.cfg.maxItems)
      .map(item => this.mapItem(item))
      .filter(p => p.url);
  }

  /** EUC-KR 등 non-UTF-8 RSS 피드를 수동 디코딩 후 파싱 */
  private async fetchWithEncoding(parser: Parser, encoding: string) {
    const { data } = await axios.get<ArrayBuffer>(this.cfg.feedUrl, {
      responseType: 'arraybuffer',
      timeout: 10_000,
      headers: {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.1',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    const decoded = new TextDecoder(encoding).decode(data);
    const cleanXml = decoded.replace(/encoding="[^"]*"/i, 'encoding="UTF-8"');
    return parser.parseString(cleanXml);
  }

  private mapItem(item: Parser.Item): ScrapedPost {
    if (this.cfg.sourceKey === 'google_trends') {
      return this.mapGoogleTrendsItem(item);
    }
    if (this.cfg.sourceKey.startsWith('youtube_')) {
      return this.mapYoutubeItem(item);
    }

    return {
      sourceKey: this.cfg.sourceKey,
      sourceName: this.cfg.sourceName,
      title: item.title?.trim() ?? '(제목 없음)',
      url: item.link ?? item.guid ?? '',
      author: item.creator ?? (item as any)['dc:creator'] ?? undefined,
      publishedAt: safeDate(item.pubDate),
    };
  }

  private mapYoutubeItem(item: Parser.Item): ScrapedPost {
    const ext = item as any;
    const mediaGroup = ext.mediaGroup ?? {};
    // YouTube Atom: <media:group><media:thumbnail url="..."/></media:group>
    const thumbnail = mediaGroup['media:thumbnail']?.[0]?.['$']?.url
      ?? mediaGroup['media:thumbnail']?.['$']?.url
      ?? undefined;

    return {
      sourceKey: this.cfg.sourceKey,
      sourceName: this.cfg.sourceName,
      title: item.title?.trim() ?? '(제목 없음)',
      url: item.link ?? item.guid ?? '',
      thumbnail,
      author: ext.author ?? item.creator ?? undefined,
      publishedAt: safeDate(item.isoDate ?? item.pubDate),
    };
  }

  private mapGoogleTrendsItem(item: Parser.Item): ScrapedPost {
    const ext = item as any;
    const keyword = item.title?.trim() ?? '';
    const traffic = ext.htApproxTraffic ?? '';
    const picture = ext.htPicture ?? undefined;
    const newsUrl = ext.htNewsItemUrl ?? '';
    const newsTitle = ext.htNewsItemTitle ?? '';

    // 키워드 기반 고유 URL 생성 (link가 피드 URL로 동일하므로)
    const uniqueUrl = newsUrl || `https://trends.google.com/trends/trendingsearches/daily?geo=KR#${encodeURIComponent(keyword)}`;

    const title = newsTitle
      ? `${keyword} (${traffic}) — ${newsTitle}`
      : `${keyword} (검색량 ${traffic})`;

    return {
      sourceKey: this.cfg.sourceKey,
      sourceName: this.cfg.sourceName,
      title,
      url: uniqueUrl,
      thumbnail: picture,
      author: `검색량 ${traffic}`,
      viewCount: parseTraffic(traffic),
      publishedAt: safeDate(item.pubDate),
      metadata: { keyword, traffic, trafficNum: parseTraffic(traffic) },
    };
  }
}

function parseTraffic(traffic: string): number {
  const cleaned = traffic.replace(/[^0-9KkMm+,]/g, '').replace(/,/g, '');
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) return 0;
  if (/[Kk]/.test(traffic)) return num * 1000;
  if (/[Mm]/.test(traffic)) return num * 1000000;
  return num;
}

