import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { KworbSpotifyKrScraper } from '../../src/scrapers/kworb-spotify.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../fixtures/kworb-spotify-kr.html'), 'utf-8');

describe('KworbSpotifyKrScraper', () => {
  afterEach(() => vi.clearAllMocks());

  it('parses Spotify Korea daily chart', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new KworbSpotifyKrScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBe(2);
    expect(posts[0].sourceKey).toBe('kworb_spotify_kr');
    expect(posts[0].category).toBe('music');
  });

  it('extracts artist, title, streams and Spotify URL', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
    const scraper = new KworbSpotifyKrScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts[0].title).toContain('SWIM');
    expect(posts[0].title).toContain('BTS');
    expect(posts[0].author).toBe('BTS');
    expect(posts[0].url).toContain('open.spotify.com/track/xyz789');
    const meta = posts[0].metadata as any;
    expect(meta.rank).toBe(1);
    expect(meta.streams).toBe(101337);
  });
});
