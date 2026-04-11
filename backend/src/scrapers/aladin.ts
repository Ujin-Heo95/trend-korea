import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
};

export class AladinBestsellerScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get(
      'https://www.aladin.co.kr/shop/common/wbest.aspx?BestType=Bestseller&BranchType=1&CID=0&page=1&cnt=100&SortOrder=1',
      { headers: HEADERS, timeout: 15_000 },
    );

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    // .ss_book_box is the actual book item container
    $('.ss_book_box').each((i, el) => {
      const box = $(el);

      // Title from .bo3
      const title = box.find('.bo3').text().trim();
      if (!title) return;

      // URL from first product link
      const href = box.find('a[href*="wproduct.aspx?ItemId="]').first().attr('href') ?? '';
      const itemId = href.match(/ItemId=(\d+)/)?.[1];
      if (!itemId) return;

      const author = box.find('a[href*="AuthorSearch"]').first().text().trim();
      const publisher = box.find('a[href*="PublisherSearch"]').first().text().trim();

      // Cover image: prefer cover200 over SpineShelf
      const coverImg = box.find('img[src*="cover200"], img[data-original*="cover200"]').first();
      const imageUrl = coverImg.attr('data-original') || coverImg.attr('src')
        || box.find('img[src*="image.aladin.co.kr"]').first().attr('src')
        || undefined;

      const rank = posts.length + 1;
      const url = `https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=${itemId}`;

      // Deduplicate by URL
      if (posts.some(p => p.url === url)) return;

      posts.push({
        sourceKey: 'aladin_bestseller',
        sourceName: '알라딘 베스트셀러',
        title: `${rank}위 ${title} — ${author}`,
        url,
        thumbnail: imageUrl,
        author,
        category: 'books',
        metadata: { rank, title, author, publisher, imageUrl },
      });
    });

    return posts;
  }
}
