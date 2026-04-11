import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

import { useBookmarks } from '../hooks/useBookmarks';
import type { Post } from '../types';

const STORAGE_KEY = 'weeklit:bookmarks';

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    source_key: 'dcinside',
    source_name: 'DC인사이드',
    title: '테스트 게시글',
    url: 'https://example.com/1',
    view_count: 100,
    comment_count: 10,
    like_count: 5,
    vote_count: 3,
    first_scraped_at: new Date().toISOString(),
    scraped_at: new Date().toISOString(),
    category: 'community',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe('useBookmarks', () => {
  it('starts with empty bookmarks', () => {
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.bookmarks).toEqual([]);
  });

  it('toggleBookmark adds a bookmark', () => {
    const { result } = renderHook(() => useBookmarks());
    const post = makePost({ id: 42, title: '북마크 테스트' });

    act(() => {
      result.current.toggleBookmark(post);
    });

    expect(result.current.isBookmarked(42)).toBe(true);
    expect(result.current.bookmarks).toHaveLength(1);
    expect(result.current.bookmarks[0].title).toBe('북마크 테스트');
  });

  it('toggleBookmark removes a bookmark when toggled again', () => {
    const { result } = renderHook(() => useBookmarks());
    const post = makePost({ id: 7 });

    act(() => {
      result.current.toggleBookmark(post);
    });
    expect(result.current.isBookmarked(7)).toBe(true);

    act(() => {
      result.current.toggleBookmark(post);
    });
    expect(result.current.isBookmarked(7)).toBe(false);
    expect(result.current.bookmarks).toHaveLength(0);
  });

  it('isBookmarked returns false for non-bookmarked post', () => {
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.isBookmarked(999)).toBe(false);
  });

  it('persists bookmarks to localStorage', () => {
    const { result } = renderHook(() => useBookmarks());
    const post = makePost({ id: 10 });

    act(() => {
      result.current.toggleBookmark(post);
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(10);
  });

  it('loads bookmarks from localStorage on mount', () => {
    const existing = [
      { id: 5, title: '기존 북마크', source_name: 'Test', url: 'https://x.com', saved_at: new Date().toISOString() },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    const { result } = renderHook(() => useBookmarks());
    expect(result.current.isBookmarked(5)).toBe(true);
    expect(result.current.bookmarks).toHaveLength(1);
  });

  it('enforces max cap of 100 bookmarks', () => {
    const { result } = renderHook(() => useBookmarks());

    // Add 101 bookmarks
    act(() => {
      for (let i = 1; i <= 101; i++) {
        result.current.toggleBookmark(makePost({ id: i, title: `Post ${i}` }));
      }
    });

    expect(result.current.bookmarks.length).toBeLessThanOrEqual(100);
    // The most recent bookmark (101) should be present
    expect(result.current.isBookmarked(101)).toBe(true);
  });

  it('sorts bookmarks by saved_at descending (newest first)', () => {
    const { result } = renderHook(() => useBookmarks());

    act(() => {
      result.current.toggleBookmark(makePost({ id: 1, title: 'First' }));
    });
    act(() => {
      result.current.toggleBookmark(makePost({ id: 2, title: 'Second' }));
    });

    // Most recently added should be first
    expect(result.current.bookmarks[0].id).toBe(2);
    expect(result.current.bookmarks[1].id).toBe(1);
  });
});
