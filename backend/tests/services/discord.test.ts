import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('notifyScraperErrors', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('does nothing if no webhook url configured', async () => {
    vi.doMock('../../src/config/index.js', () => ({
      config: { discordWebhookUrl: '' },
    }));
    const { notifyScraperErrors } = await import('../../src/services/discord.js');
    await notifyScraperErrors('high', [{ sourceKey: 'test', error: 'fail' }]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does nothing if errors array is empty', async () => {
    vi.doMock('../../src/config/index.js', () => ({
      config: { discordWebhookUrl: 'https://discord.test/webhook' },
    }));
    const { notifyScraperErrors } = await import('../../src/services/discord.js');
    await notifyScraperErrors('high', []);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends webhook with error details', async () => {
    vi.doMock('../../src/config/index.js', () => ({
      config: { discordWebhookUrl: 'https://discord.test/webhook' },
    }));
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { notifyScraperErrors } = await import('../../src/services/discord.js');
    await notifyScraperErrors('medium', [
      { sourceKey: 'dcinside', error: 'timeout' },
      { sourceKey: 'fmkorea', error: '403 forbidden' },
    ]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://discord.test/webhook');
    const body = JSON.parse(opts.body);
    expect(body.embeds[0].title).toContain('medium');
    expect(body.embeds[0].description).toContain('dcinside');
    expect(body.embeds[0].description).toContain('fmkorea');
  });

  it('handles fetch failure gracefully', async () => {
    vi.doMock('../../src/config/index.js', () => ({
      config: { discordWebhookUrl: 'https://discord.test/webhook' },
    }));
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const { notifyScraperErrors } = await import('../../src/services/discord.js');
    // Should not throw
    await notifyScraperErrors('high', [{ sourceKey: 'test', error: 'fail' }]);
  });
});
