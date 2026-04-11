import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
};

export class Yes24BestsellerScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get(
      'https://www.yes24.com/Product/Category/BestSeller?CategoryNumber=001&sumgb=06',
      { headers: HEADERS, timeout: 15_000 },
    );

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('.itemUnit').each((i, el) => {
      const rank = i + 1;
      const linkEl = $(el).find('a.gd_name[href*="/product/goods/"], a.lnk_img[href*="/product/goods/"]').first();
      const href = linkEl.attr('href') ?? '';
      const goodsNo = href.match(/goods\/(\d+)/i)?.[1] ?? '';
      if (!goodsNo) return;

      const title = $(el).find('a.gd_name').first().text().trim();
      if (!title) return;

      const author = $(el).find('.info_auth a').first().text().trim();
      const publisher = $(el).find('.info_pub a').first().text().trim();
      const priceText = $(el).find('.info_price .yes_b').first().text().trim();
      const price = priceText.replace(/[^0-9]/g, '') || undefined;
      const imageUrl = $(el).find('img[data-original*="image.yes24.com"]').attr('data-original')
        || $(el).find('img[src*="image.yes24.com"]').attr('src')
        || `https://image.yes24.com/goods/${goodsNo}/L`;
      const url = `https://www.yes24.com/Product/Goods/${goodsNo}`;

      posts.push({
        sourceKey: 'yes24_bestseller',
        sourceName: 'YES24 베스트셀러',
        title: `${rank}위 ${title}${author ? ` — ${author}` : ''}`,
        url,
        thumbnail: imageUrl,
        author,
        category: 'books',
        metadata: { rank, title, author, publisher, price, imageUrl },
      });
    });

    return posts;
  }
}
