import { describe, it, expect, vi, afterEach } from 'vitest';
import nock from 'nock';

describe('fetchHtml', () => {
  afterEach(() => {
    nock.cleanAll();
    vi.restoreAllMocks();
  });

  it('fetches and parses HTML with cheerio', async () => {
    nock('https://example.com')
      .get('/test')
      .reply(200, '<html><body><h1>Hello</h1></body></html>');

    const { fetchHtml } = await import('../../src/scrapers/http-utils.js');
    const $ = await fetchHtml('https://example.com/test', { delay: [0, 0] });
    expect($('h1').text()).toBe('Hello');
  });

  it('sets User-Agent header', async () => {
    nock('https://example.com')
      .get('/ua')
      .reply(function () {
        const ua = this.req.headers['user-agent'];
        return [200, `<html><body>${ua}</body></html>`];
      });

    const { fetchHtml } = await import('../../src/scrapers/http-utils.js');
    const $ = await fetchHtml('https://example.com/ua', { delay: [0, 0] });
    expect($('body').text()).toContain('Mozilla');
  });

  it('handles EUC-KR encoded pages', async () => {
    const eucKrBuffer = new TextEncoder().encode('<html><body>Test</body></html>');
    nock('https://example.com')
      .get('/euckr')
      .reply(200, Buffer.from(eucKrBuffer));

    const { fetchHtml } = await import('../../src/scrapers/http-utils.js');
    const $ = await fetchHtml('https://example.com/euckr', { eucKr: true, delay: [0, 0] });
    expect($('body').text()).toContain('Test');
  });
});
