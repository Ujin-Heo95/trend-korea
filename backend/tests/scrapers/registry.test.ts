import { describe, it, expect } from 'vitest';
import { getEnabledSources, getSourceMeta, getSourcesByPriority } from '../../src/scrapers/registry.js';

describe('registry', () => {
  it('getEnabledSources returns only enabled entries', () => {
    const enabled = getEnabledSources();
    expect(enabled.length).toBeGreaterThan(0);
    expect(enabled.every(s => s.enabled)).toBe(true);
  });

  it('getSourceMeta returns key/name/category for all sources', () => {
    const meta = getSourceMeta();
    expect(meta.length).toBeGreaterThanOrEqual(60);
    for (const m of meta) {
      expect(typeof m.key).toBe('string');
      expect(typeof m.name).toBe('string');
      expect(typeof m.category).toBe('string');
    }
  });

  it('getSourcesByPriority filters by priority', () => {
    const high = getSourcesByPriority('high');
    const medium = getSourcesByPriority('medium');
    const low = getSourcesByPriority('low');

    expect(high.every(s => s.priority === 'high')).toBe(true);
    expect(medium.every(s => s.priority === 'medium')).toBe(true);
    expect(low.every(s => s.priority === 'low')).toBe(true);

    // All enabled sources should be covered by one priority level
    const allEnabled = getEnabledSources();
    expect(high.length + medium.length + low.length).toBe(allEnabled.length);
  });

  it('each enabled source has required fields', () => {
    const enabled = getEnabledSources();
    for (const s of enabled) {
      expect(s.key).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(['rss', 'html', 'api', 'apify']).toContain(s.type);
      expect(['high', 'medium', 'low']).toContain(s.priority);

      if (s.type === 'rss') {
        expect(s.feedUrl).toBeTruthy();
      } else {
        expect(s.module).toBeTruthy();
        expect(s.className).toBeTruthy();
      }
    }
  });
});
