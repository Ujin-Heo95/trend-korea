import { useState, useCallback } from 'react';
import { postVote } from '../api/client';
import { trackEvent } from '../lib/analytics';

const STORAGE_KEY = 'weeklit:votes';
const OLD_STORAGE_KEY = 'trend-korea:votes';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface VoteEntry {
  ts: number;
}

function loadStore(): Record<string, VoteEntry> {
  try {
    // Migrate from old key once
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old) {
      if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, old);
      localStorage.removeItem(OLD_STORAGE_KEY);
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const store = JSON.parse(raw) as Record<string, VoteEntry>;

    const now = Date.now();
    const pruned: Record<string, VoteEntry> = {};
    let changed = false;
    for (const [id, entry] of Object.entries(store)) {
      if (now - entry.ts < TTL_MS) {
        pruned[id] = entry;
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

export function useVotes() {
  const [store, setStore] = useState(loadStore);

  const hasVoted = useCallback(
    (postId: number) => String(postId) in store,
    [store],
  );

  const vote = useCallback((postId: number, onCountUpdate?: (count: number) => void) => {
    const key = String(postId);
    let wasAlreadyVoted = false;
    setStore(prev => {
      if (key in prev) { wasAlreadyVoted = true; return prev; }
      const next = { ...prev, [key]: { ts: Date.now() } };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* quota exceeded */ }
      return next;
    });
    if (wasAlreadyVoted) return;

    trackEvent('vote', { postId });

    postVote(postId)
      .then(res => onCountUpdate?.(res.vote_count))
      .catch(() => {
        // Revert optimistic vote on failure
        setStore(prev => {
          const { [key]: _, ...rest } = prev;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
          } catch { /* quota exceeded */ }
          return rest;
        });
        onCountUpdate?.(-1); // Signal rollback with -1
      });
  }, []);

  return { hasVoted, vote };
}
