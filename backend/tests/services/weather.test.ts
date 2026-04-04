import { describe, it, expect } from 'vitest';
import { getLatestBaseTime, CITIES } from '../../src/services/weather.js';

describe('getLatestBaseTime', () => {
  // Helper: create a Date from KST hours/minutes
  // KST = UTC + 9, so UTC hour = KST hour - 9
  function kstDate(year: number, month: number, day: number, hour: number, minute: number): Date {
    return new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
  }

  it('returns 0200 base time when KST is 02:15', () => {
    const now = kstDate(2026, 4, 4, 2, 15);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20260404', baseTime: '0200' });
  });

  it('returns 0500 base time when KST is 05:30', () => {
    const now = kstDate(2026, 4, 4, 5, 30);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20260404', baseTime: '0500' });
  });

  it('returns 2300 base time when KST is 23:30', () => {
    const now = kstDate(2026, 4, 4, 23, 30);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20260404', baseTime: '2300' });
  });

  it('returns previous day 2300 when KST is 00:05 (before 02:10)', () => {
    const now = kstDate(2026, 4, 4, 0, 5);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20260403', baseTime: '2300' });
  });

  it('returns previous day 2300 when KST is 01:00', () => {
    const now = kstDate(2026, 4, 4, 1, 0);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20260403', baseTime: '2300' });
  });

  it('returns previous day 2300 when KST is 02:09 (within 10min buffer)', () => {
    const now = kstDate(2026, 4, 4, 2, 9);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20260403', baseTime: '2300' });
  });

  it('returns 0200 when KST is exactly 02:10 (buffer boundary)', () => {
    const now = kstDate(2026, 4, 4, 2, 10);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20260404', baseTime: '0200' });
  });

  it('returns 1400 when KST is 14:10', () => {
    const now = kstDate(2026, 4, 4, 14, 10);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20260404', baseTime: '1400' });
  });

  it('returns 1100 when KST is 14:05 (1400 not yet available due to buffer)', () => {
    const now = kstDate(2026, 4, 4, 14, 5);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20260404', baseTime: '1100' });
  });

  it('returns 2000 when KST is 20:45', () => {
    const now = kstDate(2026, 4, 4, 20, 45);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20260404', baseTime: '2000' });
  });

  it('handles month boundary (Jan 1 midnight → Dec 31)', () => {
    const now = kstDate(2026, 1, 1, 0, 5);
    const result = getLatestBaseTime(now);
    expect(result).toEqual({ baseDate: '20251231', baseTime: '2300' });
  });

  it('uses current time when no argument provided', () => {
    const result = getLatestBaseTime();
    expect(result.baseDate).toMatch(/^\d{8}$/);
    expect(result.baseTime).toMatch(/^\d{4}$/);
  });
});

describe('CITIES', () => {
  it('contains seoul with correct coordinates', () => {
    expect(CITIES.seoul).toEqual({ name: '서울', nx: 60, ny: 127 });
  });

  it('contains 9 cities', () => {
    expect(Object.keys(CITIES).length).toBe(9);
  });

  it('all cities have nx and ny coordinates', () => {
    for (const [, city] of Object.entries(CITIES)) {
      expect(typeof city.nx).toBe('number');
      expect(typeof city.ny).toBe('number');
      expect(typeof city.name).toBe('string');
    }
  });
});
