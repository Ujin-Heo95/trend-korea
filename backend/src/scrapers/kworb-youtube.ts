import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

/**
 * YouTube 한국 일간 차트 (kworb.net)
 * https://kworb.net/youtube/insights/kr_daily.html
 */
export class KworbYoutubeKrScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://kworb.net/youtube/insights/kr_daily.html', {
      headers: { Referer: 'https://kworb.net/' },
      timeout: 15_000,
    });
    const posts: ScrapedPost[] = [];

    $('table tbody tr').each((i, el) => {
      const cells = $(el).find('td');
      const rankText = cells.eq(0).text().trim();
      const rank = parseInt(rankText, 10) || i + 1;

      // Position change (P+ column)
      const changeText = cells.eq(1).text().trim();
      let rankChange: string = '-';
      if (changeText === '=' || changeText === '') rankChange = '-';
      else if (changeText.startsWith('+')) rankChange = changeText;
      else if (changeText.startsWith('-')) rankChange = changeText;
      else if (changeText === 'NEW') rankChange = 'NEW';

      // Track cell: "Artist - Title M/V" (may contain links)
      const trackCell = cells.eq(2);
      const trackText = trackCell.text().trim();

      // Parse "Artist - Title" format
      const dashIdx = trackText.indexOf(' - ');
      let artist: string;
      let title: string;

      if (dashIdx > 0) {
        artist = trackText.slice(0, dashIdx).trim();
        title = trackText.slice(dashIdx + 3).trim()
          .replace(/\s*M\/V\s*$/i, '')
          .replace(/\s*MV\s*$/i, '')
          .replace(/\s*\(Official.*?\)\s*$/i, '')
          .replace(/\s*\[Official.*?\]\s*$/i, '');
      } else {
        artist = '';
        title = trackText;
      }

      // Streams column
      const streamsText = cells.eq(3).text().trim().replace(/,/g, '');
      const streams = parseInt(streamsText, 10) || 0;

      if (!title) return;

      // Extract YouTube video link if available
      const videoLink = trackCell.find('a').attr('href') ?? '';
      const videoId = videoLink.match(/\/([^/]+)\.html$/)?.[1] ?? '';
      const url = videoId
        ? `https://www.youtube.com/watch?v=${videoId}`
        : `https://kworb.net/youtube/insights/kr_daily.html#rank-${rank}`;

      posts.push({
        sourceKey: 'kworb_youtube_kr',
        sourceName: 'YouTube 한국',
        title: `${rank}위 ${title} — ${artist}`,
        url,
        author: artist,
        category: 'music',
        metadata: {
          rank,
          title,
          artist,
          streams,
          rankChange,
        },
      });
    });

    return posts;
  }
}
