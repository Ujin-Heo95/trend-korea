import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

export class KworbSpotifyKrScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://kworb.net/spotify/country/kr_daily.html', {
      timeout: 15_000,
    });

    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('table#spotifydaily tbody tr').each((i, el) => {
      if (i >= 30) return;

      const cells = $(el).find('td');
      const rankText = cells.eq(0).text().trim();
      const rank = parseInt(rankText, 10) || i + 1;

      // Artist - Title cell: contains <div> with <a>Artist</a> - <a>Title</a>
      const infoCell = cells.eq(2);
      const links = infoCell.find('a');
      const artist = links.eq(0).text().trim();
      const title = links.eq(1).text().trim();

      // Extract Spotify track ID from href
      const trackHref = links.eq(1).attr('href') ?? '';
      const trackId = trackHref.match(/track\/([^.]+)\.html/)?.[1] ?? '';

      const streamsText = cells.eq(6).text().trim().replace(/,/g, '');
      const streams = parseInt(streamsText, 10) || 0;

      if (!title || !artist) return;

      const url = trackId
        ? `https://open.spotify.com/track/${trackId}`
        : `https://kworb.net/spotify/country/kr_daily.html`;

      posts.push({
        sourceKey: 'kworb_spotify_kr',
        sourceName: 'Spotify 한국',
        title: `${rank}위 ${title} — ${artist}`,
        url,
        author: artist,
        category: 'music',
        metadata: {
          rank, title, artist, songNo: trackId, streams,
          peakPosition: parseInt(cells.eq(1).text().trim()) || undefined,
          totalStreams: parseInt(cells.eq(7)?.text().trim().replace(/,/g, '')) || undefined,
        },
      });
    });

    return posts;
  }
}
