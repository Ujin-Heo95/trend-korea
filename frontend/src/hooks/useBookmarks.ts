import { useState, useCallback } from 'react';
import type { Post } from '../types';

const STORAGE_KEY = 'weeklit:bookmarks';
const MAX_BOOKMARKS = 100;

export interface SavedPost {
  id: number;
  title: string;
  source_name: string;
  url: string;
  thumbnail?: string;
  saved_at: string;
}

function loadStore(): SavedPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as SavedPost[];
    return items.sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime());
  } catch {
    return [];
  }
}

function saveStore(items: SavedPost[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* quota exceeded */ }
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<SavedPost[]>(loadStore);

  const isBookmarked = useCallback(
    (postId: number) => bookmarks.some(b => b.id === postId),
    [bookmarks],
  );

  const toggleBookmark = useCallback((post: Post) => {
    setBookmarks(prev => {
      const exists = prev.some(b => b.id === post.id);
      if (exists) {
        const next = prev.filter(b => b.id !== post.id);
        saveStore(next);
        return next;
      }
      const entry: SavedPost = {
        id: post.id,
        title: post.title,
        source_name: post.source_name,
        url: post.url,
        thumbnail: post.thumbnail,
        saved_at: new Date().toISOString(),
      };
      const next = [entry, ...prev].slice(0, MAX_BOOKMARKS);
      saveStore(next);
      return next;
    });
  }, []);

  return { bookmarks, isBookmarked, toggleBookmark };
}
