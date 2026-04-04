import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { FlixPatrolScraper } from '../../src/scrapers/flixpatrol.js';

vi.mock('axios');

const __dirname = dirname(fileURLToPath(import.meta.url));
const netflixHtml = readFileSync(join(__dirname, '../fixtures/flixpatrol-netflix.html'), 'utf-8');
const disneyHtml = readFileSync(join(__dirname, '../fixtures/flixpatrol-disney.html'), 'utf-8');

describe('FlixPatrolScraper', () => {
  afterEach(() => vi.clearAllMocks());

  it('parses Netflix + Disney+ rankings', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: netflixHtml })
      .mockResolvedValueOnce({ data: disneyHtml });
    const scraper = new FlixPatrolScraper(null as any);
    const posts = await scraper.fetch();
    // 2 Netflix movies + 1 Netflix TV + 1 Disney+ = 4 items
    expect(posts.length).toBe(4);
    expect(posts[0].sourceKey).toBe('flixpatrol');
    expect(posts[0].category).toBe('ott');
  });

  it('extracts platform, type and change labels', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: netflixHtml })
      .mockResolvedValueOnce({ data: disneyHtml });
    const scraper = new FlixPatrolScraper(null as any);
    const posts = await scraper.fetch();

    // First item: Netflix movie, no change
    const meta0 = posts[0].metadata as any;
    expect(meta0.platform).toBe('Netflix');
    expect(meta0.type).toBe('movie');
    expect(meta0.title).toBe('테스트무비1');

    // Second item: Netflix movie, rank up
    const meta1 = posts[1].metadata as any;
    expect(meta1.changeLabel).toBe('▲1');

    // Third: Netflix TV, NEW
    const meta2 = posts[2].metadata as any;
    expect(meta2.type).toBe('series');
    expect(meta2.changeLabel).toBe('NEW');

    // Fourth: Disney+
    const meta3 = posts[3].metadata as any;
    expect(meta3.platform).toBe('Disney+');
  });

  it('limits to 20 items', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: netflixHtml })
      .mockResolvedValueOnce({ data: disneyHtml });
    const scraper = new FlixPatrolScraper(null as any);
    const posts = await scraper.fetch();
    expect(posts.length).toBeLessThanOrEqual(20);
  });
});
