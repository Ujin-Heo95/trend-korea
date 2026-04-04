import { describe, it, expect } from 'vitest';
import { classifyNewsSubcategory } from '../../src/scrapers/news-classifier.js';

describe('classifyNewsSubcategory', () => {
  describe('URL pattern matching', () => {
    it('classifies politics URLs', () => {
      expect(classifyNewsSubcategory('https://news.example.com/politics/article1', 'generic')).toBe('정치');
      expect(classifyNewsSubcategory('https://news.example.com/pol/article1', 'generic')).toBe('정치');
    });

    it('classifies economy URLs', () => {
      expect(classifyNewsSubcategory('https://news.example.com/economy/article1', 'generic')).toBe('경제');
      expect(classifyNewsSubcategory('https://news.example.com/finance/article1', 'generic')).toBe('경제');
      expect(classifyNewsSubcategory('https://news.example.com/money/article1', 'generic')).toBe('경제');
    });

    it('classifies society URLs', () => {
      expect(classifyNewsSubcategory('https://news.example.com/society/article1', 'generic')).toBe('사회');
      expect(classifyNewsSubcategory('https://news.example.com/national/article1', 'generic')).toBe('사회');
    });

    it('classifies international URLs', () => {
      expect(classifyNewsSubcategory('https://news.example.com/international/article1', 'generic')).toBe('세계');
      expect(classifyNewsSubcategory('https://news.example.com/world/article1', 'generic')).toBe('세계');
      expect(classifyNewsSubcategory('https://news.example.com/global/article1', 'generic')).toBe('세계');
    });

    it('classifies entertainment URLs', () => {
      expect(classifyNewsSubcategory('https://news.example.com/entertain/article1', 'generic')).toBe('연예');
      expect(classifyNewsSubcategory('https://news.example.com/culture/article1', 'generic')).toBe('연예');
      expect(classifyNewsSubcategory('https://news.example.com/celeb/article1', 'generic')).toBe('연예');
    });

    it('classifies sports URLs', () => {
      expect(classifyNewsSubcategory('https://news.example.com/sports/article1', 'generic')).toBe('스포츠');
      expect(classifyNewsSubcategory('https://news.example.com/sport/article1', 'generic')).toBe('스포츠');
    });

    it('classifies IT/science URLs', () => {
      expect(classifyNewsSubcategory('https://news.example.com/science/article1', 'generic')).toBe('IT/과학');
      expect(classifyNewsSubcategory('https://news.example.com/tech/article1', 'generic')).toBe('IT/과학');
      expect(classifyNewsSubcategory('https://news.example.com/it/article1', 'generic')).toBe('IT/과학');
      expect(classifyNewsSubcategory('https://news.example.com/digital/article1', 'generic')).toBe('IT/과학');
    });

    it('classifies life/living URLs', () => {
      expect(classifyNewsSubcategory('https://news.example.com/life/article1', 'generic')).toBe('생활');
      expect(classifyNewsSubcategory('https://news.example.com/living/article1', 'generic')).toBe('생활');
      expect(classifyNewsSubcategory('https://news.example.com/health/article1', 'generic')).toBe('생활');
      expect(classifyNewsSubcategory('https://news.example.com/wellness/article1', 'generic')).toBe('생활');
    });

    it('is case-insensitive for URL patterns', () => {
      expect(classifyNewsSubcategory('https://news.example.com/POLITICS/article1', 'generic')).toBe('정치');
      expect(classifyNewsSubcategory('https://news.example.com/Sports/article1', 'generic')).toBe('스포츠');
    });

    it('requires path segments (slashes around keyword)', () => {
      // The pattern requires / before and after the keyword
      expect(classifyNewsSubcategory('https://news.example.com/politics/article1', 'generic')).toBe('정치');
    });
  });

  describe('source defaults', () => {
    it('returns 경제 for hankyung source', () => {
      expect(classifyNewsSubcategory('https://www.hankyung.com/some-article', 'hankyung')).toBe('경제');
    });

    it('returns 경제 for mk source', () => {
      expect(classifyNewsSubcategory('https://www.mk.co.kr/some-article', 'mk')).toBe('경제');
    });
  });

  describe('null fallback', () => {
    it('returns null when URL has no matching pattern and no source default', () => {
      expect(classifyNewsSubcategory('https://news.example.com/article1', 'generic')).toBeNull();
      expect(classifyNewsSubcategory('https://unknown.com/page', 'unknown_source')).toBeNull();
    });
  });

  describe('URL pattern takes priority over source default', () => {
    it('returns URL-based category even when source has a default', () => {
      // hankyung defaults to 경제, but URL says 정치
      expect(classifyNewsSubcategory('https://www.hankyung.com/politics/article1', 'hankyung')).toBe('정치');
    });
  });
});
