import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://music.bugs.co.kr/',
};

export class BugsChartScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://music.bugs.co.kr/chart', {
      headers: HEADERS,
      timeout: 15_000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('table.list.trackList.byChart tbody tr').each((i, el) => {
      if (i >= 30) return;

      const trackId = $(el).attr('trackid') ?? '';
      const title = $(el).find('th p.title a').attr('title')?.trim()
        || $(el).find('th p.title a').text().trim();
      const artist = $(el).find('td.left p.artist a').attr('title')?.trim()
        || $(el).find('td.left p.artist a').first().text().trim();
      const album = $(el).find('td.left a.album').attr('title')?.trim()
        || $(el).find('td.left a.album').text().trim();
      const thumbnail = $(el).find('a.thumbnail img').attr('src') || undefined;
      const rankText = $(el).find('div.ranking strong').text().trim();
      const rank = parseInt(rankText, 10) || i + 1;

      if (!title || !trackId) return;

      posts.push({
        sourceKey: 'bugs_chart',
        sourceName: '벅스 차트',
        title: `${rank}위 ${title} — ${artist}`,
        url: `https://music.bugs.co.kr/track/${trackId}`,
        thumbnail,
        author: artist,
        category: 'music',
        metadata: {
          rank, songNo: trackId, title, artist, album,
          rankChange: $(el).find('.ranking .change .up').length ? `+${$(el).find('.ranking .change .up').text().trim()}`
            : $(el).find('.ranking .change .down').length ? `-${$(el).find('.ranking .change .down').text().trim()}`
            : $(el).find('.ranking .change .new').length ? 'NEW'
            : '-',
        },
      });
    });

    return posts;
  }
}
