import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ScrapedPost } from '../../src/scrapers/types.js';

// Mock modules before importing the class under test
vi.mock('apify-client', () => {
  const mockListItems = vi.fn();
  const mockCall = vi.fn();
  const mockDataset = vi.fn(() => ({ listItems: mockListItems }));
  const mockActor = vi.fn(() => ({ call: mockCall }));
  const ApifyClient = vi.fn(() => ({ actor: mockActor, dataset: mockDataset }));
  return { ApifyClient, __mockCall: mockCall, __mockListItems: mockListItems, __mockActor: mockActor, __mockDataset: mockDataset };
});

vi.mock('../../src/config/index.js', () => ({
  config: {
    apifyApiToken: 'test-token',
    apifyMonthlyBudgetCents: 2000,
    discordWebhookUrl: '',
  },
}));

vi.mock('../../src/services/discord.js', () => ({
  notifyBudgetAlert: vi.fn(),
}));

// Must import after mocks are set up
import { ApifyBaseScraper } from '../../src/scrapers/apify-base.js';
import { config } from '../../src/config/index.js';
import { notifyBudgetAlert } from '../../src/services/discord.js';
import { ApifyClient } from 'apify-client';

/** Concrete test subclass */
class TestApifyScraper extends ApifyBaseScraper {
  category = 'sns';

  mapResult(item: Record<string, unknown>): ScrapedPost | null {
    if (!item.title || !item.url) return null;
    return {
      sourceKey: 'test-actor',
      sourceName: 'Test Actor',
      title: String(item.title),
      url: String(item.url),
      author: item.author ? String(item.author) : undefined,
    };
  }
}

function makeMockPool(totalCents = 0) {
  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('apify_usage') && sql.includes('SELECT')) {
        return Promise.resolve({ rows: [{ total_cents: totalCents }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
  } as any;
}

describe('ApifyBaseScraper', () => {
  let clientInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Get the mock instance that will be created when ApifyClient is called
    clientInstance = {
      actor: vi.fn(),
      dataset: vi.fn(),
    };
    vi.mocked(ApifyClient).mockImplementation(() => clientInstance as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when apifyApiToken is empty', async () => {
    vi.mocked(config as any).apifyApiToken = '';
    const pool = makeMockPool();
    const scraper = new TestApifyScraper(pool, 'test/actor');
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(0);
    expect(ApifyClient).not.toHaveBeenCalled();
    // restore
    vi.mocked(config as any).apifyApiToken = 'test-token';
  });

  it('skips when monthly budget is exceeded and notifies Discord', async () => {
    // budget exceeded: total_cents >= 2000
    const pool = makeMockPool(2000);
    const scraper = new TestApifyScraper(pool, 'test/actor');
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(0);
    expect(notifyBudgetAlert).toHaveBeenCalledWith(2000, 2000);
    expect(ApifyClient).not.toHaveBeenCalled();
  });

  it('maps actor results to ScrapedPost array', async () => {
    const pool = makeMockPool(0);

    const mockItems = [
      { title: 'Post 1', url: 'https://example.com/1', author: 'Alice' },
      { title: 'Post 2', url: 'https://example.com/2' },
    ];

    const mockListItems = vi.fn().mockResolvedValue({ items: mockItems });
    const mockCall = vi.fn().mockResolvedValue({ defaultDatasetId: 'dataset-123' });
    clientInstance.actor.mockReturnValue({ call: mockCall });
    clientInstance.dataset.mockReturnValue({ listItems: mockListItems });

    const scraper = new TestApifyScraper(pool, 'test/actor', { maxItems: 10 });
    const posts = await scraper.fetch();

    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'test-actor',
      sourceName: 'Test Actor',
      title: 'Post 1',
      url: 'https://example.com/1',
      author: 'Alice',
    });
    expect(posts[1]).toMatchObject({
      title: 'Post 2',
      url: 'https://example.com/2',
    });

    // Verify actor was called with correct input
    expect(clientInstance.actor).toHaveBeenCalledWith('test/actor');
    expect(mockCall).toHaveBeenCalledWith({ maxItems: 10 });
    expect(clientInstance.dataset).toHaveBeenCalledWith('dataset-123');
  });

  it('filters out null results from mapResult', async () => {
    const pool = makeMockPool(0);

    const mockItems = [
      { title: 'Valid Post', url: 'https://example.com/1' },
      { title: 'Missing URL' },          // mapResult returns null (no url)
      { url: 'https://example.com/3' },  // mapResult returns null (no title)
    ];

    const mockListItems = vi.fn().mockResolvedValue({ items: mockItems });
    const mockCall = vi.fn().mockResolvedValue({ defaultDatasetId: 'dataset-456' });
    clientInstance.actor.mockReturnValue({ call: mockCall });
    clientInstance.dataset.mockReturnValue({ listItems: mockListItems });

    const scraper = new TestApifyScraper(pool, 'test/actor');
    const posts = await scraper.fetch();

    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('Valid Post');
  });

  it('caps results at 30 items', async () => {
    const pool = makeMockPool(0);

    const mockItems = Array.from({ length: 50 }, (_, i) => ({
      title: `Post ${i}`,
      url: `https://example.com/${i}`,
    }));

    const mockListItems = vi.fn().mockResolvedValue({ items: mockItems });
    const mockCall = vi.fn().mockResolvedValue({ defaultDatasetId: 'dataset-789' });
    clientInstance.actor.mockReturnValue({ call: mockCall });
    clientInstance.dataset.mockReturnValue({ listItems: mockListItems });

    const scraper = new TestApifyScraper(pool, 'test/actor');
    const posts = await scraper.fetch();

    expect(posts).toHaveLength(30);
  });

  it('records usage in apify_usage table after successful run', async () => {
    const pool = makeMockPool(0);

    const mockItems = [
      { title: 'Post 1', url: 'https://example.com/1' },
      { title: 'Post 2', url: 'https://example.com/2' },
    ];

    const mockListItems = vi.fn().mockResolvedValue({ items: mockItems });
    const mockCall = vi.fn().mockResolvedValue({ defaultDatasetId: 'dataset-abc' });
    clientInstance.actor.mockReturnValue({ call: mockCall });
    clientInstance.dataset.mockReturnValue({ listItems: mockListItems });

    const scraper = new TestApifyScraper(pool, 'test/actor');
    await scraper.fetch();

    // Verify INSERT into apify_usage was called
    const insertCall = pool.query.mock.calls.find(
      (call: [string, ...unknown[]]) => call[0].includes('INSERT INTO apify_usage'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall[1]).toEqual(['test/actor', 'sns', expect.any(Number), 2]);
  });

  it('continues when budget check query fails', async () => {
    const pool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT')) {
          return Promise.reject(new Error('DB connection failed'));
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
    } as any;

    const mockItems = [{ title: 'Post 1', url: 'https://example.com/1' }];
    const mockListItems = vi.fn().mockResolvedValue({ items: mockItems });
    const mockCall = vi.fn().mockResolvedValue({ defaultDatasetId: 'dataset-err' });
    clientInstance.actor.mockReturnValue({ call: mockCall });
    clientInstance.dataset.mockReturnValue({ listItems: mockListItems });

    const scraper = new TestApifyScraper(pool, 'test/actor');
    // Should not throw — budget check failure is non-fatal
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(1);
  });
});
