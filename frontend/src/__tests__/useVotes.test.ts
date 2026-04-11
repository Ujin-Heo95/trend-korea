import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock analytics
vi.mock('../lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

// Mock API client
vi.mock('../api/client', () => ({
  postVote: vi.fn(),
}));

import { useVotes } from '../hooks/useVotes';
import { postVote } from '../api/client';

const STORAGE_KEY = 'weeklit:votes';
const OLD_STORAGE_KEY = 'trend-korea:votes';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe('useVotes', () => {
  it('hasVoted returns false for a post that has not been voted', () => {
    const { result } = renderHook(() => useVotes());
    expect(result.current.hasVoted(1)).toBe(false);
  });

  it('vote() adds entry to localStorage and hasVoted returns true', async () => {
    vi.mocked(postVote).mockResolvedValue({ vote_count: 1, is_new_vote: true });

    const { result } = renderHook(() => useVotes());

    act(() => {
      result.current.vote(42);
    });

    expect(result.current.hasVoted(42)).toBe(true);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored['42']).toBeDefined();
    expect(stored['42'].ts).toBeTypeOf('number');
  });

  it('prevents voting again after localStorage already contains the post', () => {
    // Pre-seed localStorage with a vote for post 10
    const existingVotes = { '10': { ts: Date.now() } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existingVotes));

    vi.mocked(postVote).mockResolvedValue({ vote_count: 2, is_new_vote: true });

    const { result } = renderHook(() => useVotes());

    // hasVoted should be true from localStorage
    expect(result.current.hasVoted(10)).toBe(true);

    // Voting should be a no-op
    act(() => {
      result.current.vote(10);
    });

    expect(postVote).not.toHaveBeenCalled();
  });

  it('prunes expired entries on load', () => {
    const expired: Record<string, { ts: number }> = {
      '1': { ts: Date.now() - TTL_MS - 1000 },
      '2': { ts: Date.now() },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expired));

    const { result } = renderHook(() => useVotes());

    expect(result.current.hasVoted(1)).toBe(false);
    expect(result.current.hasVoted(2)).toBe(true);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored['1']).toBeUndefined();
    expect(stored['2']).toBeDefined();
  });

  it('migrates from old storage key', () => {
    const oldData = JSON.stringify({ '5': { ts: Date.now() } });
    localStorage.setItem(OLD_STORAGE_KEY, oldData);

    const { result } = renderHook(() => useVotes());

    expect(result.current.hasVoted(5)).toBe(true);
    expect(localStorage.getItem(OLD_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });

  it('rolls back optimistic vote on API failure', async () => {
    vi.mocked(postVote).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useVotes());
    const onCountUpdate = vi.fn();

    act(() => {
      result.current.vote(99, onCountUpdate);
    });

    // Optimistically voted
    expect(result.current.hasVoted(99)).toBe(true);

    // Wait for async rejection
    await vi.waitFor(() => {
      expect(onCountUpdate).toHaveBeenCalledWith(-1);
    });

    // Rolled back
    expect(result.current.hasVoted(99)).toBe(false);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect(stored['99']).toBeUndefined();
  });

  it('calls onCountUpdate with server count on success', async () => {
    vi.mocked(postVote).mockResolvedValue({ vote_count: 7, is_new_vote: true });

    const { result } = renderHook(() => useVotes());
    const onCountUpdate = vi.fn();

    act(() => {
      result.current.vote(20, onCountUpdate);
    });

    await vi.waitFor(() => {
      expect(onCountUpdate).toHaveBeenCalledWith(7);
    });
  });
});
