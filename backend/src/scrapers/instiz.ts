import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { parseKoreanDate } from './http-utils.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };

// 상세 페이지는 추천 수를 정적 HTML에 노출하지 않음(AJAX). 대신:
//  - 기본 리스트(/pt): 시간순 + `조회 N` 포함
//  - 추천순 리스트(/pt?srt=2): `조회 N l 추천 N` 포함
// 두 리스트를 합쳐 url -> (view, like) 맵을 만든다.
const VIEW_RE = /조회\s+([\d,]+)/;
const LIKE_RE = /추천\s+([\d,]+)/;
const TIME_RE = /(\d{2}:\d{2}|\d{2}\.\d{2})/;

function normalizeUrl(href: string): string {
  const q = href.indexOf('?');
  return q === -1 ? href : href.slice(0, q);
}

function toInt(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

interface ListRow {
  url: string;
  title: string;
  commentCount?: number;
  viewCount?: number;
  likeCount?: number;
  publishedAt?: Date;
}

function parseListPage(html: string): ListRow[] {
  const $ = cheerio.load(html);
  const rows: ListRow[] = [];

  $('a[href^="https://www.instiz.net/pt/"]').each((_, el) => {
    const sbj = $(el).find('.sbj');
    if (!sbj.length) return;

    const href = $(el).attr('href') ?? '';
    const url = normalizeUrl(href);
    const title = sbj.text().trim();
    if (!title || !url) return;

    const listnoText = $(el).find('.listno').text();
    const cmtTitle = $(el).find('.cmt3').attr('title') ?? '';
    const cmtMatch = cmtTitle.match(/([\d,]+)/);

    const timeMatch = listnoText.match(TIME_RE);
    const viewMatch = listnoText.match(VIEW_RE);
    const likeMatch = listnoText.match(LIKE_RE);

    rows.push({
      url,
      title,
      commentCount: toInt(cmtMatch?.[1]),
      viewCount: toInt(viewMatch?.[1]),
      likeCount: toInt(likeMatch?.[1]),
      publishedAt: timeMatch ? parseKoreanDate(timeMatch[1]) : undefined,
    });
  });

  return rows;
}

export class InstizScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const [timeRes, likeRes] = await Promise.allSettled([
      axios.get('https://www.instiz.net/pt', { headers: UA, timeout: 15_000 }),
      axios.get('https://www.instiz.net/pt?srt=2', { headers: UA, timeout: 15_000 }),
    ]);

    if (timeRes.status !== 'fulfilled') throw timeRes.reason;

    const timeRows = parseListPage(timeRes.value.data);
    const likeRows = likeRes.status === 'fulfilled' ? parseListPage(likeRes.value.data) : [];

    // url -> likeCount (추천순 리스트가 유일하게 추천 수를 노출)
    const likeByUrl = new Map<string, number>();
    for (const row of likeRows) {
      if (row.likeCount !== undefined) likeByUrl.set(row.url, row.likeCount);
    }

    const sliced = timeRows.slice(0, 30);
    return sliced.map(row => ({
      sourceKey: 'instiz',
      sourceName: '인스티즈',
      title: row.title,
      url: row.url,
      commentCount: row.commentCount,
      viewCount: row.viewCount,
      likeCount: likeByUrl.get(row.url),
      publishedAt: row.publishedAt,
    }));
  }
}
