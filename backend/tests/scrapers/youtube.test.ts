import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { YoutubeScraper } from '../../src/scrapers/youtube.js';

vi.mock('axios');

const mockResponse = {
  items: [
    {
      id: 'abc123',
      snippet: {
        title: '유튜브 인기 영상',
        channelTitle: '채널명',
        thumbnails: { medium: { url: 'https://i.ytimg.com/abc.jpg' } },
        publishedAt: '2026-03-28T10:00:00Z',
      },
      statistics: { viewCount: '500000', commentCount: '1234' },
    },
  ],
};

describe('YoutubeScraper', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps API response to ScrapedPost[]', async () => {
    const scraper = new YoutubeScraper(null as any, 'FAKE_KEY');
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(1);
    expect(posts[0].sourceKey).toBe('youtube');
    expect(posts[0].sourceName).toBe('YouTube');
    expect(posts[0].title).toBe('유튜브 인기 영상');
    expect(posts[0].viewCount).toBe(500000);
    expect(posts[0].url).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('returns empty array when apiKey is empty', async () => {
    const scraper = new YoutubeScraper(null as any, '');
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(0);
  });

  it('includes thumbnail and author from snippet', async () => {
    const scraper = new YoutubeScraper(null as any, 'FAKE_KEY');
    const posts = await scraper.fetch();
    expect(posts[0].thumbnail).toBe('https://i.ytimg.com/abc.jpg');
    expect(posts[0].author).toBe('채널명');
  });

  it('parses commentCount from statistics', async () => {
    const scraper = new YoutubeScraper(null as any, 'FAKE_KEY');
    const posts = await scraper.fetch();
    expect(posts[0].commentCount).toBe(1234);
  });

  it('converts publishedAt to Date object', async () => {
    const scraper = new YoutubeScraper(null as any, 'FAKE_KEY');
    const posts = await scraper.fetch();
    expect(posts[0].publishedAt).toEqual(new Date('2026-03-28T10:00:00Z'));
  });

  it('handles missing statistics gracefully', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        items: [
          {
            id: 'def456',
            snippet: {
              title: 'Video without stats',
              channelTitle: 'Channel',
              thumbnails: { medium: { url: 'https://i.ytimg.com/def.jpg' } },
              publishedAt: '2026-03-28T10:00:00Z',
            },
          },
        ],
      },
    });
    const scraper = new YoutubeScraper(null as any, 'FAKE_KEY');
    const posts = await scraper.fetch();
    expect(posts[0].viewCount).toBe(0);
    expect(posts[0].commentCount).toBe(0);
  });

  it('handles empty items array', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { items: [] } });
    const scraper = new YoutubeScraper(null as any, 'FAKE_KEY');
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(0);
  });

  it('calls YouTube API with correct parameters', async () => {
    const scraper = new YoutubeScraper(null as any, 'FAKE_KEY');
    await scraper.fetch();
    expect(axios.get).toHaveBeenCalledWith(
      'https://www.googleapis.com/youtube/v3/videos',
      expect.objectContaining({
        params: expect.objectContaining({
          part: 'snippet,statistics',
          chart: 'mostPopular',
          regionCode: 'KR',
          maxResults: 20,
          key: 'FAKE_KEY',
        }),
      })
    );
  });
});
