import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://news.nate.com/',
};

// Nate 뉴스 랭킹 (관심뉴스 일간)
// https://news.nate.com/rank/interest?sc=all&p=day
// EUC-KR 인코딩, cheerio 파싱

export class NateNewsScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get<ArrayBuffer>(
      'https://news.nate.com/rank/interest?sc=all&p=day',
      {
        headers: HEADERS,
        timeout: 15_000,
        responseType: 'arraybuffer',
      },
    );

    const html = new TextDecoder('euc-kr').decode(data);
    const $ = cheerio.load(html);
    const posts: ScrapedPost[] = [];

    // 각 mduSubjectList 블록이 하나의 랭킹 기사
    $('div.mduSubjectList').each((_, block) => {
      if (posts.length >= 30) return;

      const rankText = $(block).find('dl.mduRank dt em').first().text().trim();
      const rank = parseInt(rankText, 10) || posts.length + 1;

      const a = $(block).find('a[href*="/view/"]').first();
      const href = a.attr('href') ?? '';
      const title = a.find('h2.tit').text().trim();
      if (!title || !href) return;

      const url = href.startsWith('http')
        ? href
        : `https://news.nate.com${href.replace(/^\/\/news\.nate\.com/, '')}`;

      const thumbnail = a.find('img').first().attr('src') || undefined;
      const mediumText = $(block).find('span.medium').text().trim();
      const author = mediumText.replace(/\d{4}-\d{2}-\d{2}.*/, '').trim() || undefined;

      posts.push({
        sourceKey: 'nate_news',
        sourceName: '네이트 뉴스 랭킹',
        title,
        url,
        thumbnail,
        author,
        category: 'portal',
        metadata: { rank },
      });
    });

    return posts;
  }
}
