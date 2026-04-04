import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://news.naver.com/',
};

export class NaverNewsRankingScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get<ArrayBuffer>(
      'https://news.naver.com/main/ranking/popularDay.naver',
      {
        headers: HEADERS,
        timeout: 15_000,
        responseType: 'arraybuffer',
      },
    );

    const html = new TextDecoder('euc-kr').decode(data);
    const $ = cheerio.load(html);
    const posts: ScrapedPost[] = [];

    $('div.rankingnews_box').each((_, box) => {
      const author = $(box).find('strong.rankingnews_name').text().trim() || undefined;

      $(box).find('ul.rankingnews_list li').each((_, el) => {
        if (posts.length >= 30) return;

        const a = $(el).find('a.list_title');
        const title = a.text().trim();
        const href = a.attr('href') ?? '';
        if (!title || !href) return;

        const url = href.startsWith('http') ? href : `https://news.naver.com${href}`;
        const thumbnail = $(el).find('a.list_img img').attr('src') || undefined;

        posts.push({
          sourceKey: 'naver_news_ranking',
          sourceName: '네이버 뉴스 랭킹',
          title,
          url,
          thumbnail,
          author,
          category: 'news',
        });
      });
    });

    return posts;
  }
}
