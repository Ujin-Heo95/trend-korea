import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { PostsResponse, IssueDetailResponse } from '../types';

vi.mock('axios', () => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  };
  return {
    default: {
      create: vi.fn(() => mockInstance),
      __mockInstance: mockInstance,
    },
  };
});

// Access the mock instance
const mockApi = (axios as unknown as { __mockInstance: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> } }).__mockInstance;

// Import after mocking
import { fetchPosts, fetchIssueDetail, postVote, fetchSources, fetchTrending } from '../api/client';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('API client', () => {
  describe('fetchPosts', () => {
    it('returns PostsResponse with correct shape', async () => {
      const mockResponse: PostsResponse = {
        posts: [
          {
            id: 1,
            source_key: 'dcinside',
            source_name: 'DC인사이드',
            title: '테스트',
            url: 'https://example.com',
            view_count: 100,
            comment_count: 10,
            like_count: 5,
            vote_count: 3,
            first_scraped_at: '2026-01-01T00:00:00Z',
            scraped_at: '2026-01-01T00:00:00Z',
            category: 'community',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchPosts({ category: 'community', page: 1 });

      expect(mockApi.get).toHaveBeenCalledWith('/posts', {
        params: { category: 'community', page: 1 },
      });
      expect(result.posts).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.posts[0].source_key).toBe('dcinside');
    });

    it('propagates network errors', async () => {
      mockApi.get.mockRejectedValue(new Error('Network Error'));

      await expect(fetchPosts({})).rejects.toThrow('Network Error');
    });
  });

  describe('fetchIssueDetail', () => {
    it('returns issue detail for a given post ID', async () => {
      const mockDetail: IssueDetailResponse = {
        post: {
          id: 42,
          source_key: 'theqoo',
          source_name: '더쿠',
          title: '이슈 상세',
          url: 'https://theqoo.net/42',
          view_count: 5000,
          comment_count: 200,
          like_count: 50,
          vote_count: 10,
          first_scraped_at: '2026-01-01T00:00:00Z',
          scraped_at: '2026-01-01T00:00:00Z',
          category: 'community',
        },
        trend_score: 85.5,
        cluster_members: [],
        engagement_history: [],
      };
      mockApi.get.mockResolvedValue({ data: mockDetail });

      const result = await fetchIssueDetail(42);

      expect(mockApi.get).toHaveBeenCalledWith('/posts/42');
      expect(result.post.id).toBe(42);
      expect(result.trend_score).toBe(85.5);
    });
  });

  describe('postVote', () => {
    it('sends POST request and returns vote count', async () => {
      mockApi.post.mockResolvedValue({ data: { vote_count: 5, is_new_vote: true } });

      const result = await postVote(10);

      expect(mockApi.post).toHaveBeenCalledWith('/posts/10/vote');
      expect(result.vote_count).toBe(5);
      expect(result.is_new_vote).toBe(true);
    });

    it('propagates errors on vote failure', async () => {
      mockApi.post.mockRejectedValue(new Error('Server Error'));

      await expect(postVote(10)).rejects.toThrow('Server Error');
    });
  });

  describe('fetchSources', () => {
    it('returns array of sources', async () => {
      const mockSources = [
        { key: 'dcinside', name: 'DC인사이드', category: 'community', post_count: 50, last_updated: '2026-01-01T00:00:00Z' },
      ];
      mockApi.get.mockResolvedValue({ data: mockSources });

      const result = await fetchSources();

      expect(mockApi.get).toHaveBeenCalledWith('/sources');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('dcinside');
    });
  });

  describe('fetchTrending', () => {
    it('returns trending posts', async () => {
      const mockData = { posts: [{ id: 1, title: 'Trending' }] };
      mockApi.get.mockResolvedValue({ data: mockData });

      const result = await fetchTrending();

      expect(mockApi.get).toHaveBeenCalledWith('/posts/trending');
      expect(result.posts).toHaveLength(1);
    });
  });
});
