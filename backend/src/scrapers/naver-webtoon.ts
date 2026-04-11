import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

interface WebtoonTitle {
  readonly titleId: number;
  readonly titleName: string;
  readonly author: string;
  readonly thumbnailUrl: string;
  readonly starScore: number;
  readonly adult: boolean;
  readonly up: boolean;
  readonly rest: boolean;
  readonly finish: boolean;
}

interface WebtoonApiResponse {
  readonly titleListMap: Readonly<Record<string, readonly WebtoonTitle[]>>;
}

export class NaverWebtoonScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const res = await fetch('https://comic.naver.com/api/webtoon/titlelist/weekday', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Referer: 'https://comic.naver.com/webtoon',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Naver Webtoon API HTTP ${res.status}`);

    const data: WebtoonApiResponse = await res.json() as WebtoonApiResponse;

    const todayDay = DAY_NAMES[new Date().getDay()];
    const titles = data.titleListMap?.[todayDay] ?? [];

    const sorted = [...titles]
      .filter(t => !t.rest && !t.finish)
      .sort((a, b) => b.starScore - a.starScore);

    return sorted.slice(0, 30).map((t, i) => ({
      sourceKey: 'naver_webtoon',
      sourceName: '네이버 웹툰',
      title: t.titleName,
      url: `https://comic.naver.com/webtoon/list?titleId=${t.titleId}`,
      author: t.author,
      thumbnail: t.thumbnailUrl,
      likeCount: Math.round(t.starScore * 100),
      metadata: {
        rank: i + 1,
        starScore: t.starScore,
        isNew: t.up,
      },
    }));
  }
}
