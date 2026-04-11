import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
};

export class GenieChartScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://www.genie.co.kr/chart/top200', {
      headers: HEADERS,
      timeout: 15_000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('table.list-wrap tbody tr.list').each((i, el) => {
      const songId = $(el).attr('songid') ?? '';
      const title = $(el).find('td.info a.title').text().trim();
      const artist = $(el).find('td.info a.artist').text().trim();
      const album = $(el).find('td.info a.albumtitle').text().trim();
      const thumbnail = $(el).find('a.cover img').attr('src') || undefined;
      const rankText = $(el).find('td.number').text().trim().split(/\s/)[0];
      const rank = parseInt(rankText, 10) || i + 1;

      if (!title || !songId) return;

      posts.push({
        sourceKey: 'genie_chart',
        sourceName: '지니 차트',
        title: `${rank}위 ${title} — ${artist}`,
        url: `https://www.genie.co.kr/detail/songInfo?xgnm=${songId}`,
        thumbnail,
        author: artist,
        category: 'music',
        metadata: {
          rank, songNo: songId, title, artist, album,
          rankChange: $(el).find('.icon.new').length ? 'NEW'
            : $(el).find('.icon.up').length ? `+${$(el).find('span.rank-change').text().trim() || '?'}`
            : $(el).find('.icon.down').length ? `-${$(el).find('span.rank-change').text().trim() || '?'}`
            : '-',
        },
      });
    });

    return posts;
  }
}
