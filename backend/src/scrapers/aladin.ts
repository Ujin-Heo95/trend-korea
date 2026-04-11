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
      'https://www.aladin.co.kr/shop/common/wbest.aspx?BestType=Bestseller&BranchType=1&CID=0&page=1&cnt=1000&SortOrder=1',
      { headers: HEADERS, timeout: 15_000 },
    );

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    // Aladin uses numbered items in a list
    $('a[href*="wproduct.aspx?ItemId="]').each((i, el) => {

      const href = $(el).attr('href') ?? '';
      const itemId = href.match(/ItemId=(\d+)/)?.[1];
      if (!itemId) return;

      // Skip non-title links (author/publisher links also contain ItemId sometimes)
      const text = $(el).text().trim();
      if (!text || text.length < 2) return;
      if (text === '보러가기') return;

      // Find the parent container
      const container = $(el).closest('li, tr, .ss_book_box, div[itemscope]');

      const rank = posts.length + 1;
      const title = text;
      const author = container.find('a[href*="AuthorSearch="]').first().text().trim();
      const publisher = container.find('a[href*="PublisherSearch="]').first().text().trim();
      const priceEl = container.find('em, .ss_p2, b.bo3').first().text().trim();
      const price = priceEl.replace(/[^0-9]/g, '') || undefined;
      const imageUrl = container.find('img[src*="image.aladin.co.kr"]').attr('src') || undefined;
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
        metadata: { rank, title, author, publisher, price, imageUrl },
      });
    });

    return posts;
  }
}
