import { describe, it, expect, vi, afterEach } from 'vitest';
import { LRUCache } from '../../src/cache/lru.js';

describe('LRUCache', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<string>(5, 1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('stores and retrieves values', () => {
    const cache = new LRUCache<number>(5, 1000);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });

  it('evicts oldest entry when max size exceeded', () => {
    const cache = new LRUCache<number>(2, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('get() refreshes position so entry is not evicted', () => {
    const cache = new LRUCache<number>(2, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // refreshes 'a'
    cache.set('c', 3); // should evict 'b' (now oldest)
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('expires entries after TTL', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const cache = new LRUCache<string>(5, 500);
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');

    vi.spyOn(Date, 'now').mockReturnValue(now + 600);
    expect(cache.get('key')).toBeUndefined();
  });

  it('clear() removes all entries', () => {
    const cache = new LRUCache<number>(5, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('overwriting key updates value and refreshes position', () => {
    const cache = new LRUCache<number>(2, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10); // overwrite 'a'
    cache.set('c', 3); // should evict 'b'
    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeUndefined();
  });
});
