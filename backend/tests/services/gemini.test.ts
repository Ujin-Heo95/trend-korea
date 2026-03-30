import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the config before importing gemini
vi.mock('../../src/config/index.js', () => ({
  config: { geminiApiKey: '' },
}));

// Mock the SDK
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: { text: () => 'mock summary' },
      }),
    }),
  })),
}));

describe('gemini service', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null when API key is empty', async () => {
    const { summarizePost, summarizeCategory } = await import(
      '../../src/services/gemini.js'
    );

    expect(await summarizePost('test title', 'source')).toBeNull();
    expect(await summarizeCategory('뉴스', ['title1', 'title2'])).toBeNull();
  });

  it('returns summary when API key is present', async () => {
    // Re-mock config with a key
    vi.doMock('../../src/config/index.js', () => ({
      config: { geminiApiKey: 'test-key' },
    }));

    const { summarizePost } = await import('../../src/services/gemini.js');
    const result = await summarizePost('삼성 주가 급등', '연합뉴스');
    expect(result).toBe('mock summary');
  });

  it('generateEditorial returns null when no API key', async () => {
    vi.doMock('../../src/config/index.js', () => ({
      config: { geminiApiKey: '' },
    }));
    const { generateEditorial } = await import('../../src/services/gemini.js');
    expect(await generateEditorial({ '뉴스': ['title1'] })).toBeNull();
  });

  it('generateEditorial returns JSON string when API key is present', async () => {
    vi.doMock('../../src/config/index.js', () => ({
      config: { geminiApiKey: 'test-key' },
    }));
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockResolvedValue({
            response: { text: () => '{"keywords":"AI,반도체","briefing":"오늘은 AI 관련","watchPoint":"내일 주목"}' },
          }),
        }),
      })),
    }));

    const { generateEditorial } = await import('../../src/services/gemini.js');
    const result = await generateEditorial({ '테크': ['AI 반도체 급등'] });
    expect(result).toContain('keywords');
  });

  it('returns null on API error without throwing', async () => {
    vi.doMock('../../src/config/index.js', () => ({
      config: { geminiApiKey: 'test-key' },
    }));
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockRejectedValue(new Error('rate limit')),
        }),
      })),
    }));

    const { summarizePost, summarizeCategory } = await import(
      '../../src/services/gemini.js'
    );

    expect(await summarizePost('title', 'source')).toBeNull();
    expect(await summarizeCategory('뉴스', ['t1'])).toBeNull();
  });
});
