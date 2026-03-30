import { describe, it, expect } from 'vitest';
import { config } from '../../src/config/index.js';

describe('config', () => {
  it('has valid port', () => {
    expect(config.port).toBeGreaterThanOrEqual(1);
    expect(config.port).toBeLessThanOrEqual(65535);
  });

  it('has valid postTtlDays', () => {
    expect(config.postTtlDays).toBeGreaterThanOrEqual(1);
  });

  it('has valid scraperRunsTtlDays', () => {
    expect(config.scraperRunsTtlDays).toBeGreaterThanOrEqual(1);
  });

  it('has valid crawlIntervalMinutes', () => {
    expect(config.crawlIntervalMinutes).toBeGreaterThanOrEqual(1);
  });

  it('has valid DB pool config', () => {
    expect(config.dbPoolMax).toBeGreaterThanOrEqual(1);
    expect(config.dbPoolMax).toBeLessThanOrEqual(50);
    expect(config.dbIdleTimeoutMs).toBeGreaterThan(0);
    expect(config.dbConnectionTimeoutMs).toBeGreaterThan(0);
  });

  it('has string fields (may be empty if env not set)', () => {
    expect(typeof config.youtubeApiKey).toBe('string');
    expect(typeof config.geminiApiKey).toBe('string');
    expect(typeof config.discordWebhookUrl).toBe('string');
    expect(typeof config.dbUrl).toBe('string');
  });
});
