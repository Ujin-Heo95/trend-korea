import { describe, it, expect } from 'vitest';
import { getSourceColor, SOURCE_COLORS } from '../constants/sourceColors';

describe('getSourceColor', () => {
  it('returns source override when source key has an override', () => {
    const result = getSourceColor('dcinside', 'community');
    expect(result).toContain('bg-blue-100');
    expect(result).toContain('text-blue-700');
  });

  it('returns category color when source has no override', () => {
    const result = getSourceColor('unknown-community-source', 'community');
    expect(result).toContain('bg-blue-100');
    expect(result).toContain('text-blue-700');
  });

  it('returns fallback when neither source override nor category exists', () => {
    const result = getSourceColor('totally-unknown');
    expect(result).toContain('bg-slate-100');
    expect(result).toContain('text-slate-600');
  });

  it('returns fallback when source has no override and category is null', () => {
    const result = getSourceColor('unknown-source', null);
    expect(result).toContain('bg-slate-100');
  });

  it('returns fallback when source has no override and category is undefined', () => {
    const result = getSourceColor('unknown-source', undefined);
    expect(result).toContain('bg-slate-100');
  });

  it('prefers source override over category color', () => {
    // theqoo is community but has a pink override
    const result = getSourceColor('theqoo', 'community');
    expect(result).toContain('bg-pink-100');
    expect(result).toContain('text-pink-700');
  });

  it('returns correct colors for each category', () => {
    const categories = [
      { key: 'news', expected: 'bg-emerald-100' },
      { key: 'video', expected: 'bg-red-100' },
      { key: 'tech', expected: 'bg-violet-100' },
      { key: 'portal', expected: 'bg-amber-100' },
      { key: 'sns', expected: 'bg-pink-100' },
      { key: 'deal', expected: 'bg-orange-100' },
    ];

    for (const { key, expected } of categories) {
      const result = getSourceColor('no-override', key);
      expect(result).toContain(expected);
    }
  });

  it('returns correct overrides for specific sources', () => {
    const sources = [
      { key: 'instiz', expected: 'bg-purple-100' },
      { key: 'natepann', expected: 'bg-yellow-100' },
      { key: 'todayhumor', expected: 'bg-lime-100' },
      { key: 'clien', expected: 'bg-teal-100' },
      { key: 'google_trends', expected: 'bg-blue-100' },
    ];

    for (const { key, expected } of sources) {
      const result = getSourceColor(key);
      expect(result).toContain(expected);
    }
  });
});

describe('SOURCE_COLORS (deprecated proxy)', () => {
  it('returns override color for known source', () => {
    const result = SOURCE_COLORS['dcinside'];
    expect(result).toContain('bg-blue-100');
  });

  it('returns fallback for unknown source', () => {
    const result = SOURCE_COLORS['nonexistent'];
    expect(result).toContain('bg-slate-100');
  });
});
