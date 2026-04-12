import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../src/scrapers/http-utils.js', () => ({
  fetchHtml: vi.fn(),
}));

import { fetchHtml } from '../../src/scrapers/http-utils.js';
import {
  extractArticleBody,
  isExtractorSupported,
  __resetExtractorCacheForTests,
} from '../../src/services/articleBodyExtractor.js';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ynaHtml = readFileSync(join(__dirname, '../fixtures/yna_article.html'), 'utf-8');
const daumHtml = readFileSync(join(__dirname, '../fixtures/daum_article.html'), 'utf-8');
const nateHtml = readFileSync(join(__dirname, '../fixtures/nate_article.html'), 'utf-8');

describe('articleBodyExtractor', () => {
  beforeEach(() => {
    __resetExtractorCacheForTests();
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(ynaHtml));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isExtractorSupported', () => {
    it('returns true for yna.co.kr URLs', () => {
      expect(isExtractorSupported('https://www.yna.co.kr/view/AKR20260412036100062')).toBe(true);
    });

    it('returns true for bare yna.co.kr without www', () => {
      expect(isExtractorSupported('https://yna.co.kr/view/test')).toBe(true);
    });

    it('returns true for daum portal article URLs', () => {
      expect(isExtractorSupported('https://v.daum.net/v/20260412213003163')).toBe(true);
    });

    it('returns true for nate news URLs (suffix match)', () => {
      expect(isExtractorSupported('https://news.nate.com/view/20260412n15179')).toBe(true);
    });

    it('returns false for unsupported domains', () => {
      expect(isExtractorSupported('https://news.naver.com/article/001/0014567890')).toBe(false);
      expect(isExtractorSupported('https://www.newsis.com/view/NISX20260412')).toBe(false);
      expect(isExtractorSupported('https://news.zum.com/articles/105004207')).toBe(false);
    });

    it('returns false for malformed URLs', () => {
      expect(isExtractorSupported('not-a-url')).toBe(false);
      expect(isExtractorSupported('')).toBe(false);
    });
  });

  describe('extractArticleBody — yna fixture', () => {
    it('extracts joined paragraph body from .story-news.article p', async () => {
      const body = await extractArticleBody('https://www.yna.co.kr/view/AKR20260412036100062');
      expect(body).not.toBeNull();
      expect(body!.length).toBeGreaterThan(200);
      expect(body).toContain('정부는 12일 새로운 정책');
      expect(body).toContain('예산 규모는 전년 대비 20% 증액');
    });

    it('strips ad/script noise from body', async () => {
      const body = await extractArticleBody('https://www.yna.co.kr/view/AKR20260412036100062');
      expect(body).not.toContain('광고 텍스트');
      expect(body).not.toContain("console.log");
    });

    it('caches results — second call does not re-fetch', async () => {
      await extractArticleBody('https://www.yna.co.kr/view/AKR20260412036100062');
      await extractArticleBody('https://www.yna.co.kr/view/AKR20260412036100062');
      expect(vi.mocked(fetchHtml)).toHaveBeenCalledTimes(1);
    });
  });

  describe('extractArticleBody — daum portal', () => {
    beforeEach(() => {
      vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(daumHtml));
    });

    it('extracts joined paragraphs from .article_view p', async () => {
      const body = await extractArticleBody('https://v.daum.net/v/20260412213003163');
      expect(body).not.toBeNull();
      expect(body!.length).toBeGreaterThan(300);
      expect(body).toContain('새로운 경제 정책을 발표');
      expect(body).toContain('소상공인 지원 확대');
    });

    it('strips figcaption photo credits and script tags', async () => {
      const body = await extractArticleBody('https://v.daum.net/v/20260412213003163');
      expect(body).not.toContain('사진=연합뉴스');
      expect(body).not.toContain('console.log');
    });

    it('passes eucKr:false for daum (default utf-8)', async () => {
      await extractArticleBody('https://v.daum.net/v/20260412213003163');
      expect(vi.mocked(fetchHtml)).toHaveBeenCalledWith(
        'https://v.daum.net/v/20260412213003163',
        expect.objectContaining({ eucKr: false }),
      );
    });
  });

  describe('extractArticleBody — nate portal', () => {
    beforeEach(() => {
      vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(nateHtml));
    });

    it('extracts element text from #realArtcContents', async () => {
      const body = await extractArticleBody('https://news.nate.com/view/20260412n15179');
      expect(body).not.toBeNull();
      expect(body!.length).toBeGreaterThan(200);
      expect(body).toContain('반도체 소자를 개발');
      expect(body).toContain('인공지능 가속기 칩');
    });

    it('strips script tags and control areas', async () => {
      const body = await extractArticleBody('https://news.nate.com/view/20260412n15179');
      expect(body).not.toContain('공유 버튼 영역');
      expect(body).not.toContain('var ad=1');
    });

    it('requests EUC-KR decoding for nate', async () => {
      await extractArticleBody('https://news.nate.com/view/20260412n15179');
      expect(vi.mocked(fetchHtml)).toHaveBeenCalledWith(
        'https://news.nate.com/view/20260412n15179',
        expect.objectContaining({ eucKr: true }),
      );
    });
  });

  describe('extractArticleBody — error paths', () => {
    it('returns null for unsupported domains without fetching', async () => {
      const body = await extractArticleBody('https://news.naver.com/article/001/0014567890');
      expect(body).toBeNull();
      expect(vi.mocked(fetchHtml)).not.toHaveBeenCalled();
    });

    it('returns null when fetch throws', async () => {
      vi.mocked(fetchHtml).mockRejectedValueOnce(new Error('ETIMEDOUT'));
      const body = await extractArticleBody('https://www.yna.co.kr/view/AKR_FAIL');
      expect(body).toBeNull();
    });

    it('caches null on fetch failure to avoid retry storms within tick', async () => {
      vi.mocked(fetchHtml).mockRejectedValueOnce(new Error('ETIMEDOUT'));
      await extractArticleBody('https://www.yna.co.kr/view/AKR_FAIL2');
      await extractArticleBody('https://www.yna.co.kr/view/AKR_FAIL2');
      expect(vi.mocked(fetchHtml)).toHaveBeenCalledTimes(1);
    });

    it('returns null when all selectors yield empty content', async () => {
      vi.mocked(fetchHtml).mockResolvedValueOnce(cheerio.load('<html><body><div>empty</div></body></html>'));
      const body = await extractArticleBody('https://www.yna.co.kr/view/AKR_EMPTY');
      expect(body).toBeNull();
    });

    it('returns null for malformed URL', async () => {
      const body = await extractArticleBody('not-a-url');
      expect(body).toBeNull();
      expect(vi.mocked(fetchHtml)).not.toHaveBeenCalled();
    });
  });
});
