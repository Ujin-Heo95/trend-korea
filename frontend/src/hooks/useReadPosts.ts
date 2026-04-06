import { useState, useCallback, useRef } from 'react';

const STORAGE_KEY = 'weeklit:read-posts';
const OLD_STORAGE_KEY = 'trend-korea:read-posts';
const TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

interface ReadEntry {
  ts: number;
}

function loadStore(): Record<string, ReadEntry> {
  try {
    // Migrate from old key once
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old) {
      if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, old);
      localStorage.removeItem(OLD_STORAGE_KEY);
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const store = JSON.parse(raw) as Record<string, ReadEntry>;

    // Prune expired entries
    const now = Date.now();
    const pruned: Record<string, ReadEntry> = {};
    let changed = false;
    for (const [url, entry] of Object.entries(store)) {
      if (now - entry.ts < TTL_MS) {
        pruned[url] = entry;
      } else {
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    }
    return pruned;
  } catch {
    return {};
  }
}

export function useReadPosts() {
  const [store, setStore] = useState(loadStore);
  const storeRef = useRef(store);
  storeRef.current = store;

  const isRead = useCallback(
    (url: string) => url in storeRef.current,
    [],
  );

  const markAsRead = useCallback((url: string) => {
    setStore(prev => {
      if (url in prev) return prev;
      const next = { ...prev, [url]: { ts: Date.now() } };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* quota exceeded — ignore */ }
      return next;
    });
  }, []);

  return { isRead, markAsRead };
}
