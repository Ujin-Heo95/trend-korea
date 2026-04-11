import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://www.melon.com/',
};

export class MelonChartScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.melon.com/chart/index.htm', {
      headers: HEADERS,
      timeout: 15_000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('tr[data-song-no]').each((i, el) => {
      const songNo = $(el).attr('data-song-no') ?? '';
      const title = $(el).find('div.ellipsis.rank01 span').text().trim();
      const artist = $(el).find('div.ellipsis.rank02 span').first().text().trim();
      const album = $(el).find('div.ellipsis.rank03 a').text().trim();
      const thumbnail = $(el).find('img[src*="melon"]').attr('src') || undefined;

      if (!title || !songNo) return;

      posts.push({
        sourceKey: 'melon_chart',
        sourceName: '멜론 차트',
        title: `${i + 1}위 ${title} — ${artist}`,
        url: `https://www.melon.com/song/detail.htm?songId=${songNo}`,
        thumbnail,
        author: artist,
        category: 'music',
        metadata: {
          rank: i + 1, songNo, title, artist, album,
          rankChange: $(el).find('.rank_wrap .bullet_icons').hasClass('icon_new') ? 'NEW'
            : $(el).find('.rank_wrap .bullet_icons').hasClass('icon_up') ? `+${$(el).find('.rank_wrap .rank_num').text().trim() || '?'}`
            : $(el).find('.rank_wrap .bullet_icons').hasClass('icon_down') ? `-${$(el).find('.rank_wrap .rank_num').text().trim() || '?'}`
            : '-',
        },
      });
    });

    return posts;
  }
}
